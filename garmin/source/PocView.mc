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
    //! What the last sync said, along the bottom.
    //!
    //! Seeded with the affordance rather than left blank, because the sync
    //! build and the read-only one are otherwise identical on screen — same
    //! report, same pages — and there was no way to tell which was installed
    //! without pressing a button that might do nothing. Now the bottom line
    //! answers it before you touch anything.
    private var _status as String = "START to sync";
    //! Filled on the first layout, when the real screen height is known.
    private var _perPage as Number = 8;
    private var _syncer as Syncer;
    private var _sending as Boolean = false;

    function initialize() {
        View.initialize();
        _lines = Probe.report();
        _syncer = new Syncer();
        _status = _syncer.isDue() ? "" : agoLine();
    }

    //! Sends on open, unless a recent sync makes it pointless.
    //!
    //! onShow rather than initialize: a watch app is resumed as well as
    //! started, and the interesting moment is "it is on screen now", not "it
    //! was constructed". The throttle is what makes that safe to do every time.
    function onShow() as Void {
        /*
          Repairing the schedule is the first thing, and it happens whether or
          not a sync is due.

          The daily wake is a one-shot Moment that re-registers itself, so a
          registration that fails once would otherwise end the schedule
          permanently and silently. Opening the app puts it back, which turns
          "it never syncs again" into "it syncs the next time you look at it".
        */
        Schedule.ensure();

        if (!_sending && _syncer.isDue()) {
            syncNow();
        }
    }

    //! Sends regardless of freshness — what the button does.
    function syncNow() as Void {
        if (_sending) {
            return;
        }
        _sending = true;
        setStatus("sending...");
        _syncer.send(method(:onSyncDone));
    }

    function onSyncDone(message as String) as Void {
        _sending = false;
        setStatus(message);
    }

    //! "synced 12m ago" — so a quiet screen still says it is up to date.
    function agoLine() as String {
        var minutes = _syncer.minutesSinceSync();
        if (minutes == null) {
            return "START to sync";
        }
        return minutes < 1 ? "synced just now" : "synced " + minutes + "m ago";
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
