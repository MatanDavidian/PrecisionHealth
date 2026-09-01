import Toybox.ActivityMonitor;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.UserProfile;

//! Everything the POC reads, turned into lines of text.
//!
//! Every single access is guarded with `has` or wrapped in a try/catch, because
//! the entire purpose of this build is to find out what this watch actually
//! offers. A field that is absent has to render as "--" and let the rest of the
//! report through; an exception that takes down the app tells us nothing except
//! that something, somewhere, was missing.
module Probe {

    //! What version 0 exists to answer.
    //!
    //! Garmin documents getHistory() as supported on the FR265 since API 1.0,
    //! returning at most seven History records, most recent first. So the real
    //! unknowns are narrower than "does it work": how many days are actually
    //! populated on this watch, and what History.calories corresponds to in
    //! Garmin Connect.
    //!
    //! The three outcomes are still kept apart, because they mean completely
    //! different things. "The API is not on this device" kills the design that
    //! reads completed days. "The API is here and returned nothing" is probably
    //! a watch that has not been worn long enough, and is survivable. Collapsing
    //! them into one "no data" message would throw away the distinction.
    function report() as Array<String> {
        var out = [] as Array<String>;

        out.add("GARMIN DATA POC");
        out.add("");
        history(out);
        out.add("");
        today(out);
        out.add("");
        profile(out);

        return out;
    }

    // ---------------------------------------------------------------- history

    function history(out as Array<String>) as Void {
        if (!(ActivityMonitor has :getHistory)) {
            out.add("getHistory: UNSUPPORTED");
            out.add(" API absent on this device.");
            out.add(" The completed-day design");
            out.add(" does not work here.");
            return;
        }

        var days = null;
        try {
            days = ActivityMonitor.getHistory();
        } catch (e) {
            out.add("getHistory: THREW");
            out.add(" " + messageOf(e));
            return;
        }

        if (!(days has :size)) {
            // Garmin documents the return as Array<History>, so per the contract
            // this cannot happen. Kept anyway: it costs three lines, and on a
            // build whose entire job is finding out what this device really
            // does, "the contract did not hold" is worth being able to read.
            out.add("getHistory: SUPPORTED");
            out.add(" returned a non-array");
            return;
        }
        if (days.size() == 0) {
            out.add("getHistory: SUPPORTED");
            out.add(" history EMPTY (0 days)");
            return;
        }

        out.add("getHistory: SUPPORTED");
        out.add(days.size() + " day(s) returned");

        // Every day, not just the newest. Laid out so the dates and calorie
        // figures can be read straight down against Garmin Connect, which
        // settles the active-vs-total question and the day-boundary question
        // in one sitting.
        //
        // Garmin documents the order as most-recent-first, so index 0 is the
        // one to compare. It is marked rather than named "yesterday": whether
        // the newest entry is yesterday or today is itself a thing this build
        // is here to find out, and the printed date answers it.
        for (var i = 0; i < days.size(); i++) {
            var day = days[i];
            out.add("");
            out.add("[" + i + "]" + (i == 0 ? " <- newest" : ""));
            out.add("  date:  " + dateOf(day));
            out.add("  start: " + epochOf(day));
            out.add("  kcal:  " + num(day has :calories ? day.calories : null));
            out.add("  steps: " + num(day has :steps ? day.steps : null));
        }
    }

    //! The day a history entry belongs to, as the watch itself dated it.
    //!
    //! Printed rather than trusted. Whether `startOfDay` lands on local
    //! midnight is exactly the kind of thing to check against Connect before
    //! any of it reaches a database keyed by calendar date.
    function dateOf(day) as String {
        if (!(day has :startOfDay) || day.startOfDay == null) {
            return "(no startOfDay)";
        }
        var at = Gregorian.info(day.startOfDay, Time.FORMAT_SHORT);
        return at.year + "-" + pad(at.month) + "-" + pad(at.day);
    }

    //! `startOfDay` as a raw Unix timestamp, in seconds.
    //!
    //! Printed alongside the formatted date because it answers a data-model
    //! question rather than a debugging one: it says where Garmin anchors the
    //! day. Convert the number and see what wall clock it lands on in your own
    //! zone — 00:00 means the row is anchored to LOCAL midnight, 03:00 on a
    //! UTC+3 watch means it is anchored to UTC midnight, and anything else
    //! means a device-defined boundary we would have to model explicitly.
    //!
    //! The formatted date above is derived through Gregorian.info, which
    //! applies the local zone, so on its own it cannot tell those cases apart.
    //! That distinction decides which local calendar day a TOTAL_ENERGY
    //! observation belongs to, and getting it wrong shifts a whole day's burn
    //! onto its neighbour.
    function epochOf(day) as String {
        if (!(day has :startOfDay) || day.startOfDay == null) {
            return "--";
        }
        var at = day.startOfDay;
        if (!(at has :value)) {
            return "(no value())";
        }

        var seconds = at.value();
        if (seconds >= 0) {
            return seconds.toString();
        }

        /*
          Monkey C Numbers are 32-bit signed, so any moment past 2038-01-19
          comes back wrapped negative — the Y2038 problem, alive and well on a
          watch. The simulator walked into it immediately because its clock is
          set decades ahead; a real FR265 in 2026 is nowhere near it.

          Unwrapped so the value stays readable, and labelled so nobody records
          the wrapped one by mistake. The formatted date above is unaffected:
          Gregorian.info reads the Moment itself, not this Number.
        */
        return (seconds.toLong() + 4294967296l).toString() + " (unwrapped, past 2038)";
    }

    // ------------------------------------------------------------------ today

    function today(out as Array<String>) as Void {
        out.add("TODAY [NOT SAVED]");

        var info = null;
        try {
            info = ActivityMonitor.getInfo();
        } catch (e) {
            out.add(" getInfo THREW");
            out.add(" " + messageOf(e));
            return;
        }

        // Shown for comparison only. A running total read at any hour before
        // midnight is an undercount by definition, which is why the design
        // writes completed days and nothing for today.
        out.add("  kcal:  " + num(info has :calories ? info.calories : null) + " (part)");
        out.add("  steps: " + num(info has :steps ? info.steps : null));
        out.add("  recov: " + num(info has :timeToRecovery ? info.timeToRecovery : null) + " h");
        out.add("  stress:" + num(info has :stressScore ? info.stressScore : null));
        out.add("  resp:  " + num(info has :respirationRate ? info.respirationRate : null));
    }

    // ---------------------------------------------------------------- profile

    function profile(out as Array<String>) as Void {
        out.add("PROFILE");

        var mine = null;
        try {
            mine = UserProfile.getProfile();
        } catch (e) {
            // Most likely the UserProfile permission was declined.
            out.add(" unavailable");
            out.add(" " + messageOf(e));
            return;
        }

        out.add("  VO2 run:  " + num(mine has :vo2maxRunning ? mine.vo2maxRunning : null));
        out.add("  VO2 bike: " + num(mine has :vo2maxCycling ? mine.vo2maxCycling : null));
        out.add("  rest HR:  " + num(mine has :restingHeartRate ? mine.restingHeartRate : null));
        out.add("  avg rest: " + num(mine has :averageRestingHeartRate ? mine.averageRestingHeartRate : null));
    }

    // ------------------------------------------------------------------ small

    //! A value, or a dash when this watch does not carry it.
    //!
    //! Every call site guards its read with `has` and passes the member
    //! directly, rather than indexing the object by symbol. Symbol indexing
    //! compiles, but the compiler cannot verify it — and since every figure in
    //! this report goes through here, a runtime failure would produce a blank
    //! screen and no clue why. Naming the members makes the compiler check
    //! them, which on a build meant to discover what this device offers is the
    //! answer arriving a day earlier.
    function num(value) as String {
        return value == null ? "--" : value.toString();
    }

    function pad(n as Number) as String {
        return n < 10 ? "0" + n : n.toString();
    }

    function messageOf(e) as String {
        if (e != null && e has :getErrorMessage) {
            var message = e.getErrorMessage();
            if (message != null) {
                return message;
            }
        }
        return "unknown error";
    }
}
