import Toybox.Lang;
import Toybox.WatchUi;

//! Up and down page the report; everything else is left alone.
class PocDelegate extends WatchUi.BehaviorDelegate {

    private var _view as PocView;

    function initialize(view as PocView) {
        BehaviorDelegate.initialize();
        _view = view;
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
