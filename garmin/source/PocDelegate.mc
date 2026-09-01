import Toybox.Lang;
import Toybox.WatchUi;

//! Up and down page the report; START sends it.
class PocDelegate extends WatchUi.BehaviorDelegate {

    private var _view as PocView;
    private var _syncer as Syncer;
    private var _sending as Boolean = false;

    function initialize(view as PocView) {
        BehaviorDelegate.initialize();
        _view = view;
        _syncer = new Syncer();
    }

    //! START sends the completed days.
    //!
    //! Guarded rather than queued: a second request while the first is in
    //! flight would overwrite the responder the first one is waiting on, and
    //! the reply would land on nothing.
    function onSelect() as Boolean {
        if (_sending) {
            return true;
        }
        _sending = true;
        _view.setStatus("sending...");
        _syncer.send(method(:onSyncDone));
        return true;
    }

    function onSyncDone(message as String) as Void {
        _sending = false;
        _view.setStatus(message);
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
