import Toybox.Application;
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


    function readConfig() as SyncConfig {
        var config = new SyncConfig();
        try {
            var url = Properties.getValue("syncUrl");
            var token = Properties.getValue("deviceToken");
            config.url = url == null ? "" : url.toString();
            config.token = token == null ? "" : token.toString();
        } catch (e) {
            config.problem = "settings unreadable";
            return config;
        }
        if (config.url.length() == 0 || config.token.length() == 0) {
            // Named plainly: the commonest failure is a blank setting, and
            // "connection failed" would send someone hunting the wrong thing.
            config.problem = "set URL and token in Garmin Connect";
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
        }
        return out;
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
            onDone.invoke("sent " + data["written"] + " day(s)");
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
