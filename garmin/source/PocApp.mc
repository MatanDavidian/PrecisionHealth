import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! A watch app that reads, prints, and saves nothing.
//!
//! Version 0 of the Garmin path. Its whole job is to answer whether this device
//! returns completed previous days through ActivityMonitor.getHistory(), and to
//! show the numbers next to each other so they can be checked against Garmin
//! Connect by eye. There is no network permission in the manifest, so it cannot
//! quietly be doing anything else.
class PocApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        var view = new PocView();
        return [view, new PocDelegate(view)];
    }
}
