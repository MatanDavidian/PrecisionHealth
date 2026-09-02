import Toybox.Application;
import Toybox.Application.Properties;
import Toybox.Application.Storage;
import Toybox.Lang;

//! Where to send, and what to send it with.
//!
//! A module rather than a method on Syncer, because the background service
//! needs exactly this and nothing else. Pulling in the foreground syncer to
//! read two strings would drag its whole surface into a process with a very
//! small memory allowance.
module Cfg {

    function url() as String {
        var value = null;
        try {
            value = Properties.getValue("syncUrl");
        } catch (e) {
            value = null;
        }
        var url = value == null ? "" : value.toString();
        // Properties first so a Store build — which does get a settings page —
        // works unchanged; the compiled-in value is the sideloading fallback.
        return url.length() > 0 ? url : BuildConfig.SYNC_URL;
    }

    function token() as String {
        var value = null;
        try {
            value = Properties.getValue("deviceToken");
        } catch (e) {
            value = null;
        }
        var token = value == null ? "" : value.toString();
        return token.length() > 0 ? token : BuildConfig.DEVICE_TOKEN;
    }

    function usable() as Boolean {
        return url().length() > 0 && token().length() > 0;
    }

    //! The last completed day the server has confirmed receiving.
    //!
    //! A DATE, not a timestamp. It is what makes catching up trivial — every
    //! completed day after it is unsent — and it cannot drift with a clock the
    //! way an elapsed-time throttle can. Advanced only on a confirmed write,
    //! so a failed send is retried rather than lost.
    function lastSyncedDay() as String or Null {
        try {
            var value = Storage.getValue("lastSyncedDay");
            return value == null ? null : value.toString();
        } catch (e) {
            return null;
        }
    }

    function setLastSyncedDay(day as String) as Void {
        try {
            Storage.setValue("lastSyncedDay", day);
        } catch (e) {
            // Losing the marker costs a redundant send, which the server
            // supersedes. Not worth failing a sync over.
        }
    }
}
