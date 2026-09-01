import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

//! The report, a screenful at a time.
//!
//! Seven days of history plus today plus the profile is far more than a round
//! 46mm screen holds, and this is a diagnostic — truncating it would hide the
//! very rows we are here to read. So it pages, with up/down, and says where you
//! are so it is obvious when there is more below.
class PocView extends WatchUi.View {

    private var _lines as Array<String>;
    private var _page as Number = 0;
    //! What the last sync said, shown along the bottom. Empty until one runs.
    private var _status as String = "";
    //! Filled on the first layout, when the real screen height is known.
    private var _perPage as Number = 8;

    function initialize() {
        View.initialize();
        _lines = Probe.report();
    }

    function onLayout(dc as Graphics.Dc) as Void {
        var line = dc.getFontHeight(Graphics.FONT_XTINY);
        // One line held back for the page counter along the bottom.
        _perPage = ((dc.getHeight() - 8) / line).toNumber() - 1;
        if (_perPage < 1) {
            _perPage = 1;
        }
    }

    function setStatus(message as String) as Void {
        _status = message;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();

        var font = Graphics.FONT_XTINY;
        var line = dc.getFontHeight(font);
        var y = 4;

        var from = _page * _perPage;
        for (var i = from; i < from + _perPage && i < _lines.size(); i++) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(6, y, font, _lines[i], Graphics.TEXT_JUSTIFY_LEFT);
            y += line;
        }

        // The sync result displaces the page counter when there is one: the
        // counter is orientation, and the result is the answer to what you
        // just did.
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(
            dc.getWidth() / 2,
            dc.getHeight() - line - 2,
            font,
            _status.length() > 0 ? _status : (_page + 1) + "/" + pages(),
            Graphics.TEXT_JUSTIFY_CENTER
        );
    }

    function pages() as Number {
        var total = (_lines.size() + _perPage - 1) / _perPage;
        return total < 1 ? 1 : total.toNumber();
    }

    function nextPage() as Void {
        if (_page < pages() - 1) {
            _page++;
            WatchUi.requestUpdate();
        }
    }

    function previousPage() as Void {
        if (_page > 0) {
            _page--;
            WatchUi.requestUpdate();
        }
    }
}
