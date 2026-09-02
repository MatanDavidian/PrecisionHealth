import Toybox.ActivityMonitor;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;

//! When the background service wakes. Local time, the morning after.
const WAKE_HOUR = 7;
const WAKE_MINUTE = 30;

//! Scheduling the daily wake, from either process.
//!
//! Connect IQ has no "every day at 07:30" primitive: you register a repeating
//! Duration (five minutes at the shortest) or a one-shot Moment. A daily wake
//! is therefore a Moment that must be re-registered after every firing — and a
//! re-registration that silently fails would stop the schedule for good.
//!
//! So opening the app repairs it too. Background execution is not the only
//! thing capable of scheduling tomorrow, which means the failure mode is "it
//! syncs when you next open the app" rather than "it never syncs again".
module Schedule {

    //! Registers tomorrow morning if nothing is registered. Returns true if it
    //! had to act, which is only interesting to the tests.
    function ensure() as Boolean {
        if (!(Toybox has :Background)) {
            return false;
        }
        var already = null;
        try {
            already = Background.getTemporalEventRegisteredTime();
        } catch (e) {
            already = null;
        }
        if (already != null) {
            return false;
        }
        register();
        return true;
    }

    //! Always (re)registers the next wake, whatever is pending.
    function register() as Void {
        try {
            Background.registerForTemporalEvent(nextWake());
        } catch (e) {
            // Nothing to do but let the next app opening try again — which is
            // exactly why opening repairs the schedule.
        }
    }

    //! The next WAKE_HOUR:WAKE_MINUTE in LOCAL time, always in the future.
    //!
    //! `Gregorian.moment` reads its components as UTC, while `Gregorian.info`
    //! hands back local ones — so building a moment from what info returned
    //! produces a time offset by the timezone. Left alone it woke at 10:30 in
    //! Jerusalem instead of 07:30, and in a western timezone it would have
    //! fired the previous evening, sending "yesterday" before yesterday ended.
    function nextWake() as Time.Moment {
        var now = Time.now();
        var today = Gregorian.info(now, Time.FORMAT_SHORT);
        var offset = System.getClockTime().timeZoneOffset;
        var wallClock = Gregorian.moment({
            :year => today.year,
            :month => today.month,
            :day => today.day,
            :hour => WAKE_HOUR,
            :minute => WAKE_MINUTE,
            :second => 0,
        });
        // Cast because `subtract` is overloaded — Moment minus Duration is a
        // Moment, Moment minus Moment is a Duration — and the checker widens to
        // both without being told which one this is.
        var atWake = wallClock.subtract(new Time.Duration(offset)) as Time.Moment;

        // Registering a moment that has passed would either fire immediately or
        // be rejected; either way the schedule stops being daily.
        if (atWake.lessThan(now) || atWake.equals(now)) {
            atWake = atWake.add(new Time.Duration(Gregorian.SECONDS_PER_DAY)) as Time.Moment;
        }
        return atWake;
    }
}

//! The daily send: completed-day calories, and nothing else.
//!
//! Deliberately the narrowest thing that is still useful. A background service
//! gets about thirty seconds and a small memory allowance, so this reads one
//! field from history, posts it, and exits. Everything richer — resting heart
//! rate, VO2 max, stress — is sent by the foreground sync when the app is
//! opened, where there is room for it.
(:background)
class BgService extends System.ServiceDelegate {

    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() as Void {
        // Tomorrow is scheduled FIRST, so a failure below cannot end the daily
        // schedule. A day missed is caught up by history; a schedule lost is
        // not caught up by anything.
        Schedule.register();

        if (!Cfg.usable()) {
            Background.exit(null);
            return;
        }

        var unsent = unsentCalories();
        if (unsent.size() == 0) {
            Background.exit(null);
            return;
        }

        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
                "x-device-token" => Cfg.token(),
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
        };
        Communications.makeWebRequest(
            Cfg.url(),
            { "zone" => "device", "observations" => unsent },
            options,
            method(:onResponse)
        );
    }

    //! Completed days the server has not confirmed, oldest first.
    //!
    //! Garmin's seven records are the whole retry mechanism: three days without
    //! a connection are caught up by the next successful send, with no queue,
    //! no retry table and no state beyond one date.
    function unsentCalories() as Array<Dictionary> {
        var out = [] as Array<Dictionary>;
        if (!(ActivityMonitor has :getHistory)) {
            return out;
        }
        var days = null;
        try {
            days = ActivityMonitor.getHistory();
        } catch (e) {
            return out;
        }
        if (days == null || !(days has :size)) {
            return out;
        }

        var since = Cfg.lastSyncedDay();
        // getHistory is newest first; walk backwards so the payload reads
        // oldest first and the marker below lands on the newest.
        for (var i = days.size() - 1; i >= 0; i--) {
            var day = days[i];
            if (!(day has :startOfDay) || day.startOfDay == null) { continue; }
            if (!(day has :calories) || day.calories == null) { continue; }

            var at = Gregorian.info(day.startOfDay, Time.FORMAT_SHORT);
            var date = at.year.format("%04d") + "-" + at.month.format("%02d") + "-" +
                at.day.format("%02d");

            // ISO dates compare correctly as strings, which is the only reason
            // this is one line rather than a date library.
            if (since != null && date.compareTo(since) <= 0) { continue; }
            out.add({ "day" => date, "code" => "TOTAL_ENERGY", "value" => day.calories });
        }
        return out;
    }

    function onResponse(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200) {
            // Advanced only on a confirmed write. A send that failed is simply
            // retried tomorrow, and history still holds the day.
            var sent = unsentCalories();
            if (sent.size() > 0) {
                Cfg.setLastSyncedDay(sent[sent.size() - 1]["day"] as String);
            }
        }
        Background.exit(null);
    }
}
