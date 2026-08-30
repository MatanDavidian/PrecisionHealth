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

    //! The one question version 0 exists to answer.
    //!
    //! Three outcomes, kept apart because they mean completely different things.
    //! "The API is not on this device" kills the design that reads completed
    //! days. "The API is here and returned nothing" is probably a watch with no
    //! history yet, and is survivable. Collapsing them into one "no data"
    //! message would throw away the distinction we came for.
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

        if (days == null) {
            out.add("getHistory: SUPPORTED");
            out.add(" returned null");
            return;
        }
        if (!(days has :size)) {
            // Worth knowing rather than assuming: if it is an iterator instead
            // of an array, the ingestion code has to be written differently.
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

        // Every day, not just yesterday. Laid out so the dates and calorie
        // figures can be read straight down against Garmin Connect, which
        // settles the active-vs-total question and the day-boundary question
        // in one sitting.
        for (var i = 0; i < days.size(); i++) {
            var day = days[i];
            out.add("");
            out.add(dateOf(day));
            out.add("  kcal:  " + field(day, :calories));
            out.add("  steps: " + field(day, :steps));
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
        if (info == null) {
            out.add(" getInfo returned null");
            return;
        }

        // Shown for comparison only. A running total read at any hour before
        // midnight is an undercount by definition, which is why the design
        // writes completed days and nothing for today.
        out.add("  kcal:  " + field(info, :calories) + " (part)");
        out.add("  steps: " + field(info, :steps));
        out.add("  recov: " + field(info, :timeToRecovery) + " h");
        out.add("  stress:" + field(info, :stressScore));
        out.add("  resp:  " + field(info, :respirationRate));
    }

    // ---------------------------------------------------------------- profile

    function profile(out as Array<String>) as Void {
        out.add("PROFILE");

        var me = null;
        try {
            me = UserProfile.getProfile();
        } catch (e) {
            // Most likely the UserProfile permission was declined.
            out.add(" unavailable");
            out.add(" " + messageOf(e));
            return;
        }
        if (me == null) {
            out.add(" returned null");
            return;
        }

        out.add("  VO2 run:  " + field(me, :vo2maxRunning));
        out.add("  VO2 bike: " + field(me, :vo2maxCycling));
        out.add("  rest HR:  " + field(me, :restingHeartRate));
        out.add("  avg rest: " + field(me, :averageRestingHeartRate));
    }

    // ------------------------------------------------------------------ small

    //! One field, or "--" if this device does not carry it.
    //!
    //! `has` is checked before the read because a missing member throws in
    //! Monkey C, and "this watch does not report stress" is a result worth
    //! printing rather than a crash.
    function field(holder, name as Symbol) as String {
        if (holder == null || !(holder has name)) {
            return "--";
        }
        var value = holder[name];
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
