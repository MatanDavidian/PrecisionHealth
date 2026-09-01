import Toybox.Lang;
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
