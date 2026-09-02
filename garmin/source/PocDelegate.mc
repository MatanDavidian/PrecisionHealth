import Toybox.Lang;
import Toybox.WatchUi;

//! Up and down page the report; START sends it.
class PocDelegate extends WatchUi.BehaviorDelegate {

    private var _view as PocView;

    function initialize(view as PocView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    //! START sends the completed days.
    //!
    //! Guarded rather than queued: a second request while the first is in
    //! flight would overwrite the responder the first one is waiting on, and
    //! the reply would land on nothing.
    //! Forces a sync, freshness or not.
    //!
    //! The app sends on its own when it opens; this is for the case where it
    //! decided not to and you want it to anyway — a failed send, or data you
    //! know has just changed.
    function onSelect() as Boolean {
        _view.syncNow();
        return true;
    }

    function onNextPage() as Boolean {
        _view.nextPage();
        return true;
    }

    function onPreviousPage() as Boolean {
        _view.previousPage();
        return true;
    }
}
