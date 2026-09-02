import Toybox.Lang;
import Toybox.Time;
import Toybox.Application.Storage;
import Toybox.Test;

//! Runs the probe and the sync payload inside the simulator, on the real
//! device profile.
//!
//! It cannot answer what History.calories MEANS — that was settled on hardware
//! (2214, matching Garmin Connect's Total exactly). What it answers here is
//! whether the code runs at all on an fr265 profile: whether the API surface
//! this build assumes is really there, whether any guarded read throws anyway,
//! and whether the payload leaves in the shape the endpoint expects.
//!
//! Compiled only with `-t`, so none of it reaches the watch.
module ProbeTest {

    (:test)
    function reportRunsWithoutThrowing(logger as Logger) as Boolean {
        var lines = Probe.report();

        if (lines == null || lines.size() == 0) {
            logger.error("report() produced nothing");
            return false;
        }

        // Printed, not just counted. The point of this build is to read the
        // values, and the console is the only place they can be read from here.
        for (var i = 0; i < lines.size(); i++) {
            logger.debug(lines[i]);
        }
        return true;
    }

    (:test)
    function historyLineIsPresent(logger as Logger) as Boolean {
        var lines = Probe.report();
        for (var i = 0; i < lines.size(); i++) {
            if (lines[i].find("getHistory") != null) {
                logger.debug("gate: " + lines[i]);
                return true;
            }
        }
        logger.error("no getHistory line at all — report() bailed early");
        return false;
    }

    (:test)
    function completedDaysAreShapedForTheEndpoint(logger as Logger) as Boolean {
        var days = new Syncer().completedDays();

        if (days.size() == 0) {
            logger.error("no completed days built");
            return false;
        }

        for (var i = 0; i < days.size(); i++) {
            var entry = days[i];
            if (!entry.hasKey("day") || !entry.hasKey("code") || !entry.hasKey("value")) {
                logger.error("entry " + i + " is missing a key");
                return false;
            }
            // The date is what the server keys on, so its shape is not
            // negotiable. A malformed one is rejected by the endpoint, and the
            // sync would fail for a reason invisible from the watch.
            var day = entry["day"];
            if (!(day instanceof String) || day.length() != 10) {
                logger.error("bad date: " + day);
                return false;
            }
            logger.debug(day + "  " + entry["code"] + "  " + entry["value"]);
        }
        return true;
    }

    (:test)
    function everyCodeSentIsOneTheServerAccepts(logger as Logger) as Boolean {
        // The endpoint rejects an unknown code, and a rejection is invisible
        // from the watch — the sync reports how many were written, not which
        // were dropped. So the two lists have to be checked against each other
        // somewhere, and here is the only place that can.
        var allowed = [
            "TOTAL_ENERGY", "ACTIVE_ENERGY", "STEPS", "DISTANCE",
            "RESTING_HEART_RATE", "RESPIRATION_RATE", "STRESS", "VO2_MAX",
        ];
        var days = new Syncer().completedDays();
        for (var i = 0; i < days.size(); i++) {
            var code = days[i]["code"];
            var ok = false;
            for (var j = 0; j < allowed.size(); j++) {
                if (allowed[j].equals(code)) { ok = true; }
            }
            if (!ok) {
                logger.error("code the server will drop: " + code);
                return false;
            }
        }
        logger.debug(days.size() + " observations, every code accepted");
        return true;
    }

    (:test)
    function todaysMeasurementsAreDatedToday(logger as Logger) as Boolean {
        // Point measurements carry TODAY, unlike the accumulating ones which
        // only ever carry completed days. Dating them yesterday would file a
        // resting heart rate against the wrong morning.
        var syncer = new Syncer();
        var today = syncer.todayKey();
        var points = syncer.todaysMeasurements();
        if (today == null) {
            logger.error("no local date");
            return false;
        }
        for (var i = 0; i < points.size(); i++) {
            if (!today.equals(points[i]["day"])) {
                logger.error(points[i]["code"] + " dated " + points[i]["day"] + ", not " + today);
                return false;
            }
            logger.debug(points[i]["code"] + " " + points[i]["value"] + " on " + points[i]["day"]);
        }
        return true;
    }

    (:test)
    function freshnessThrottleOpensAndCloses(logger as Logger) as Boolean {
        var syncer = new Syncer();

        // Nothing recorded yet: the first open must send.
        Storage.deleteValue("lastSyncAt");
        if (!syncer.isDue()) {
            logger.error("a watch that has never synced must be due");
            return false;
        }

        // Just synced: opening again must not send.
        syncer.markSynced();
        if (syncer.isDue()) {
            logger.error("a sync from a moment ago should still be fresh");
            return false;
        }

        // Older than the window: due again.
        Storage.setValue("lastSyncAt", Time.now().value() - (Syncer.FRESH_FOR + 60));
        if (!syncer.isDue()) {
            logger.error("a sync older than the window should be due");
            return false;
        }

        /*
          A stored time in the FUTURE reads as due, not as fresh forever. A
          clock change or the 32-bit wrap this project has already met once
          would otherwise lock the watch out of syncing until the date caught
          up — silently, since nothing on screen would say why.
        */
        Storage.setValue("lastSyncAt", Time.now().value() + 86400);
        if (!syncer.isDue()) {
            logger.error("a future timestamp must not disable syncing");
            return false;
        }

        Storage.deleteValue("lastSyncAt");
        logger.debug("throttle opens, closes, and survives a bad clock");
        return true;
    }

    (:test)
    function backgroundSendsOnlyCompletedCalories(logger as Logger) as Boolean {
        // The narrow payload is the point: a background service has about
        // thirty seconds and a small allowance, and everything richer is the
        // foreground's job.
        Storage.deleteValue("lastSyncedDay");
        var unsent = new BgService().unsentCalories();
        if (unsent.size() == 0) {
            logger.error("nothing to send with no marker set");
            return false;
        }
        for (var i = 0; i < unsent.size(); i++) {
            if (!unsent[i]["code"].equals("TOTAL_ENERGY")) {
                logger.error("background sent " + unsent[i]["code"] + "; it may send only calories");
                return false;
            }
        }
        // Oldest first, so the marker set from the last entry is the newest.
        var first = unsent[0]["day"] as String;
        var last = unsent[unsent.size() - 1]["day"] as String;
        if (first.compareTo(last) > 0) {
            logger.error("payload is newest-first; the marker would go backwards");
            return false;
        }
        logger.debug(unsent.size() + " day(s), " + first + " to " + last);
        return true;
    }

    (:test)
    function theMarkerStopsDaysBeingResent(logger as Logger) as Boolean {
        var service = new BgService();

        Storage.deleteValue("lastSyncedDay");
        var all = service.unsentCalories();
        if (all.size() == 0) {
            logger.error("no history to work with");
            return false;
        }

        // Everything already delivered: nothing left to send.
        Cfg.setLastSyncedDay(all[all.size() - 1]["day"] as String);
        if (service.unsentCalories().size() != 0) {
            logger.error("days were resent after being marked delivered");
            return false;
        }

        // A day missed: exactly the days after the marker come back. This is
        // the whole retry mechanism — no queue, no state but one date.
        if (all.size() > 1) {
            Cfg.setLastSyncedDay(all[all.size() - 2]["day"] as String);
            var caughtUp = service.unsentCalories();
            if (caughtUp.size() != 1) {
                logger.error("expected 1 day to catch up, got " + caughtUp.size());
                return false;
            }
            logger.debug("catch-up returns " + caughtUp[0]["day"]);
        }

        Storage.deleteValue("lastSyncedDay");
        return true;
    }

    (:test)
    function theDailyWakeIsAlwaysInTheFuture(logger as Logger) as Boolean {
        // A moment already past would fire at once or be refused, and either
        // way the schedule stops being daily.
        var next = Schedule.nextWake();
        if (next.lessThan(Time.now())) {
            logger.error("the next wake is in the past");
            return false;
        }
        var at = Gregorian.info(next, Time.FORMAT_SHORT);
        if (at.hour != WAKE_HOUR || at.min != WAKE_MINUTE) {
            logger.error("woke at " + at.hour + ":" + at.min + ", not the configured time");
            return false;
        }
        // And never more than a day out, or a missed day waits two.
        if (next.subtract(Time.now()).value() > Gregorian.SECONDS_PER_DAY) {
            logger.error("the next wake is more than a day away");
            return false;
        }
        logger.debug("next wake " + at.year + "-" + at.month + "-" + at.day + " " + at.hour + ":" + at.min);
        return true;
    }

    (:test)
    function refusesToSendWithoutSettings(logger as Logger) as Boolean {
        // The commonest failure by far is a blank setting, and it has to say so
        // rather than surfacing as a connection error an hour later.
        var config = new Syncer().readConfig();
        if (config.problem == null) {
            logger.debug("settings populated in this simulator; nothing to prove");
            return true;
        }
        logger.debug("refused with: " + config.problem);
        return config.problem.find("local.env") != null;
    }
}
