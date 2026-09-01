import Toybox.Lang;
import Toybox.Test;

//! Runs the probe inside the simulator, on the real device profile.
//!
//! It cannot answer what History.calories MEANS — the simulator's activity
//! data is invented, so the numbers here are fiction. What it can answer, and
//! what is worth knowing before anything is sideloaded, is whether the code
//! runs at all on an fr265 profile: whether the API surface this build assumes
//! is really there, whether any of the guarded reads throw anyway, and whether
//! the report comes back with lines in it.
//!
//! Compiled only with `-t`, so none of this reaches the watch.
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
}
