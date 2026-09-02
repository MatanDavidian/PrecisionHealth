import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.ActivityMonitor;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;

//! Sending completed days to the backend.
//!
//! Only completed days. `getInfo().calories` is a running total by definition —
//! read at any hour before midnight it is an undercount — and writing it would
//! make the week compare a full day of eating against a partial day of
//! burning. `getHistory()` is what this sends, and today is left alone until
//! tomorrow makes it a fact.
//!
//! Triggered by hand, not by a background service. Once a day is the natural
//! rate for a figure that only changes at midnight, and Connect IQ's background
//! execution limits are a poor trade for saving one button press.
//!
//! A class rather than a module, for one small reason that is not obvious:
//! `method(:onResponse)` resolves against `self`, and a module has no instance
//! to resolve against. makeWebRequest needs a responder, so this needs to be
//! something you can hold.
//! Everything a sync needs, or a reason it cannot be made.
class SyncConfig {
    var url as String = "";
    var token as String = "";
    var problem as String or Null = null;
}

class Syncer {

    //! Where to report back to when the reply arrives.
    //!
    //! Held on the instance rather than passed through, because Monkey C hands
    //! a web responder a fixed (code, data) signature with no room for a
    //! closure. Only one sync is ever in flight — the button that starts one
    //! is disabled until it finishes.
    private var _onDone as Method or Null = null;

    function initialize() {
    }

    //! How long a sync stays fresh, in seconds.
    //!
    //! Half an hour. The data barely moves: completed days appear once, at
    //! midnight, and the point measurements drift slowly. Syncing on every
    //! glance would spend the phone's radio to send figures the server already
    //! has, and a watch app is opened far more often than its data changes.
    static const FRESH_FOR = 1800;

    //! Whether enough time has passed to be worth sending again.
    //!
    //! A stored time from the future — a clock change, or the 32-bit wrap this
    //! project has already met once — reads as "due" rather than locking the
    //! app out of syncing until the date catches up.
    function isDue() as Boolean {
        var last = null;
        try {
            last = Storage.getValue("lastSyncAt");
        } catch (e) {
            return true;
        }
        if (last == null || !(last instanceof Lang.Number)) {
            return true;
        }
        var elapsed = Time.now().value() - last;
        return elapsed < 0 || elapsed > FRESH_FOR;
    }

    function markSynced() as Void {
        try {
            Storage.setValue("lastSyncAt", Time.now().value());
        } catch (e) {
            // A throttle that cannot remember is a throttle that syncs every
            // time, which is worse than nothing but not worth failing over.
        }
    }

    //! Minutes since the last successful sync, or null if there has not been one.
    function minutesSinceSync() as Number or Null {
        var last = null;
        try {
            last = Storage.getValue("lastSyncAt");
        } catch (e) {
            return null;
        }
        if (last == null || !(last instanceof Lang.Number)) {
            return null;
        }
        var elapsed = Time.now().value() - last;
        return elapsed < 0 ? null : (elapsed / 60).toNumber();
    }


    function readConfig() as SyncConfig {
        var config = new SyncConfig();
        // Properties first, so a future store build — which DOES get a
        // settings page — needs no change here.
        try {
            var url = Properties.getValue("syncUrl");
            var token = Properties.getValue("deviceToken");
            config.url = url == null ? "" : url.toString();
            config.token = token == null ? "" : token.toString();
        } catch (e) {
            config.url = "";
            config.token = "";
        }

        // Then what was compiled in. A sideloaded app has no settings page at
        // all: Garmin Connect lists what your Connect IQ account installed, not
        // what is on the watch, so Properties are permanently empty here.
        if (config.url.length() == 0) {
            config.url = BuildConfig.SYNC_URL;
        }
        if (config.token.length() == 0) {
            config.token = BuildConfig.DEVICE_TOKEN;
        }

        if (config.url.length() == 0 || config.token.length() == 0) {
            config.problem = "no token — see garmin/local.env";
        }
        return config;
    }

    //! The completed days, as the endpoint expects them.
    //!
    //! The local calendar date is what travels, derived from `startOfDay` —
    //! which the watch anchors at local midnight, confirmed on hardware. The
    //! raw epoch is NOT sent: Monkey C Numbers are 32-bit and wrap in 2038, so
    //! it is a diagnostic rather than a key.
    function completedDays() as Array<Dictionary> {
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

        for (var i = 0; i < days.size(); i++) {
            var day = days[i];
            if (!(day has :startOfDay) || day.startOfDay == null) { continue; }
            if (!(day has :calories) || day.calories == null) { continue; }

            var at = Gregorian.info(day.startOfDay, Time.FORMAT_SHORT);
            var date = at.year.format("%04d") + "-" + at.month.format("%02d") + "-" +
                at.day.format("%02d");

            // TOTAL_ENERGY, established on hardware: History.calories matched
            // Garmin Connect's Total exactly, against an Active figure of 131.
            out.add({ "day" => date, "code" => "TOTAL_ENERGY", "value" => day.calories });

            if (day has :steps && day.steps != null) {
                out.add({ "day" => date, "code" => "STEPS", "value" => day.steps });
            }
            // Metres. The endpoint stores distance canonically in metres, and
            // Connect IQ reports it in centimetres.
            if (day has :distance && day.distance != null) {
                out.add({ "day" => date, "code" => "DISTANCE", "value" => day.distance / 100 });
            }
        }

        out.addAll(todaysMeasurements());
        return out;
    }

    //! Today's point measurements.
    //!
    //! The "only completed days" rule is about ACCUMULATING metrics. Calories
    //! and steps climb all day, so today's figure is an undercount and writing
    //! it would make a week compare a full day of eating against a partial day
    //! of burning.
    //!
    //! A resting heart rate is not like that. It is a measurement of a moment,
    //! not a total in progress, and today's value is simply today's value.
    //! Holding these back until tomorrow would lose nothing but a day.
    function todaysMeasurements() as Array<Dictionary> {
        var out = [] as Array<Dictionary>;
        var today = todayKey();
        if (today == null) {
            return out;
        }

        var info = null;
        try {
            info = ActivityMonitor.getInfo();
        } catch (e) {
            info = null;
        }
        if (info != null) {
            if (info has :stressScore && info.stressScore != null) {
                out.add({ "day" => today, "code" => "STRESS", "value" => info.stressScore });
            }
            if (info has :respirationRate && info.respirationRate != null) {
                out.add({ "day" => today, "code" => "RESPIRATION_RATE", "value" => info.respirationRate });
            }
        }

        var mine = null;
        try {
            mine = UserProfile.getProfile();
        } catch (e) {
            mine = null;
        }
        if (mine != null) {
            if (mine has :restingHeartRate && mine.restingHeartRate != null) {
                out.add({ "day" => today, "code" => "RESTING_HEART_RATE", "value" => mine.restingHeartRate });
            }
            // Running only. A cycling figure is a different measurement of a
            // different activity, and storing both under one code would have
            // them supersede each other on alternate days.
            if (mine has :vo2maxRunning && mine.vo2maxRunning != null) {
                out.add({ "day" => today, "code" => "VO2_MAX", "value" => mine.vo2maxRunning });
            }
        }
        return out;
    }

    //! The newest completed day this watch can see, or null.
    function newestCompletedDay() as String or Null {
        if (!(ActivityMonitor has :getHistory)) {
            return null;
        }
        var days = null;
        try {
            days = ActivityMonitor.getHistory();
        } catch (e) {
            return null;
        }
        if (days == null || !(days has :size) || days.size() == 0) {
            return null;
        }
        // getHistory is newest first.
        var day = days[0];
        if (!(day has :startOfDay) || day.startOfDay == null) {
            return null;
        }
        var at = Gregorian.info(day.startOfDay, Time.FORMAT_SHORT);
        return at.year.format("%04d") + "-" + at.month.format("%02d") + "-" +
            at.day.format("%02d");
    }

    //! Today, as the local calendar names it.
    function todayKey() as String or Null {
        try {
            var at = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
            return at.year.format("%04d") + "-" + at.month.format("%02d") + "-" +
                at.day.format("%02d");
        } catch (e) {
            return null;
        }
    }

    //! Send them. `onDone` is called with a short line to put on screen.
    function send(onDone as Method) as Void {
        var config = readConfig();
        if (config.problem != null) {
            onDone.invoke(config.problem);
            return;
        }

        var observations = completedDays();
        if (observations.size() == 0) {
            onDone.invoke("no completed days to send");
            return;
        }

        var body = {
            // The watch knows its offset, not its zone name — Connect IQ has no
            // API for the latter. The server fills the zone from the person's
            // profile rather than guessing one from an offset.
            "zone" => "device",
            "observations" => observations,
        };

        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
                // A header of our own rather than Authorization, which the
                // Supabase gateway uses for its own purposes.
                "x-device-token" => config.token,
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
        };

        _onDone = onDone;
        Communications.makeWebRequest(config.url, body, options, method(:onResponse));
    }

    //! What came back, in the few words a watch face has room for.
    function onResponse(code as Number, data as Dictionary or String or Null) as Void {
        var onDone = _onDone;
        _onDone = null;
        if (onDone == null) {
            return;
        }

        if (code == 200 && data instanceof Dictionary && data.hasKey("written")) {
            markSynced();
            /*
              The foreground and the background share one marker. Opening the
              app is a successful sync of every completed day, so the morning
              service has nothing left to send — and neither resends what the
              other already delivered.
            */
            var newest = newestCompletedDay();
            if (newest != null) {
                Cfg.setLastSyncedDay(newest);
            }
            onDone.invoke("sent " + data["written"] + " reading(s)");
            return;
        }
        if (code == 401) {
            onDone.invoke("token rejected");
            return;
        }
        // The HTTP code is shown rather than swallowed. Connect IQ's negative
        // codes are its own transport errors — -104 is no phone connection,
        // which is the one people hit — and hiding them behind "failed" turns
        // a five-second diagnosis into an evening.
        onDone.invoke("failed (" + code + ")");
    }
}
