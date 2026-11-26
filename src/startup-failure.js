/* The "failed to start" message. A classic script (not an ES module), ES5 syntax only, that scripts/build/build.mjs
   (startupScript) minifies and inlines as the first thing in <head>, before the page's <style> and long before the app's
   <script>, so it still runs when the stylesheet or the app's script is broken. It depends on nothing of the page: no app
   CSS (inline styles with CSS system colors only, so it reads in the light and the dark OS theme), no framework, no markup
   in the template (the message is made with DOM calls). The text must never contain a closing script tag: the build stops
   if the inlined script does.

   Failed start = an uncaught error or an unhandled rejection before the check, or, at the check, no start marker
   (main.js sets data-started on <html> once the root element <gsa-app> and every element drawn inside it, the screens, have
   drawn for the first time) or a page root that is missing or empty. The check runs once, one timer turn after DOMContentLoaded:
   the app's script is a classic inline script at the end of <body>, so it has run to its end before DOMContentLoaded, and the
   first draws (Lit draws in microtasks, which run before any timer) are done by then. A draw that throws leaves the marker
   unset, and main.js reports its error with reportError, which reaches the 'error' listener at once: the browser's own
   'unhandledrejection' event for it is a task of its own, which WebKit runs after the check's timer. No clock is involved, so a
   slow device cannot raise a false alarm. After the check the listeners are removed: a later error is not a startup failure. docs/engineering/architecture.md, "Startup failure". */
(function () {
  // The settings key; the sheets' keys are this plus a colon and more. The build writes the value of
  // src/ui/store-key.js over the marker, so the key is written once.
  var PREFIX = '@STORE_KEY@';
  // The dev flag that turns the reload guard off (src/ui/router/unload-guard.js) is in that family but is not saved data: a person
  // never sets it, and a reset leaves it. The build writes its key over the marker too.
  var GUARD_FLAG = '@UNLOAD_GUARD_OFF_KEY@';
  var errors = [];

  // Until the check below has run, the page itself (the .wrap root) is not painted: a start that fails midway would
  // otherwise show its half-built page for a frame before the message hides it. In its place the boot shell (#boot in the
  // template: the title, the tab bar with the saved tab selected, and a loading line) shows from the first paint, so a slow
  // start is not a blank page. display:none, not visibility:hidden: a descendant with visibility:visible of its own (the sort
  // arrow of the Gear browser's table) paints through a hidden ancestor. The check removes this style and the shell on every
  // path; a healthy page is painted one timer turn after DOMContentLoaded.
  var hold = document.createElement('style');
  hold.textContent = '.wrap{display:none!important}#boot{display:block}';
  document.head.appendChild(hold);
  function release() {
    if (hold.parentNode) {
      hold.parentNode.removeChild(hold);
    }
    var shell = document.getElementById('boot');
    if (shell && shell.parentNode) {
      shell.parentNode.removeChild(shell);
    }
    document.documentElement.removeAttribute('data-boot-tab');
  }

  // The tab the page will open, for the shell: data-boot-tab on <html> picks the selected tab link and the loading line
  // (styles/layout.css). The address names it (#/gear is the Gear browser, #/math and #/math/... How the math works); a bare or
  // other address leaves the Sheets tab. The words are ui/router/routes.js's.
  var firstWord = String(location.hash)
    .replace(/^#/, '')
    .split('?')[0]
    .split('/')
    .filter(function (word) {
      return word !== '';
    })[0];
  var bootTab = 'sheets';
  if (firstWord === 'gear') {
    bootTab = 'browse';
  } else if (firstWord === 'math') {
    bootTab = 'math';
  }
  document.documentElement.setAttribute('data-boot-tab', bootTab);

  // The page's saved-data keys (the settings key, and every key that starts with the key and a colon, except the dev flag),
  // or null when the browser does not let the page read its storage. Another page's key that only starts like ours is not
  // one of them.
  function savedKeys() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key !== GUARD_FLAG && (key === PREFIX || key.indexOf(PREFIX + ':') === 0)) {
          keys.push(key);
        }
      }
      return keys;
    } catch (e) {
      return null;
    }
  }

  // The error as one line of text: "Name: message".
  function errorText(event) {
    var error = 'reason' in event ? event.reason : event.error;
    if (error && error.message) {
      return (error.name || 'Error') + ': ' + error.message;
    }
    return String(event.message || error || 'Unknown error');
  }
  function onError(event) {
    errors.push(errorText(event));
  }

  // A new element with its inline style, its text (set as text, never as markup: an error may quote saved data) and,
  // when given, the id 'startfail' + idSuffix.
  function make(tag, style, text, idSuffix) {
    var node = document.createElement(tag);
    node.style.cssText = style;
    if (text) {
      node.textContent = text;
    }
    if (idSuffix) {
      node.id = 'startfail' + idSuffix;
    }
    return node;
  }

  // The message, first in <body>, with the rest of the page hidden: a page that only partly started shows a half-built
  // screen that cannot be trusted, so a failed start looks the same whether or not the root was built.
  function show() {
    var keys = savedKeys();
    var text = 'font:inherit;color:inherit;margin:0 0 8px';
    var button = function (idSuffix, label) {
      var node = make('button', 'font:inherit;padding:5px 12px;margin:0 8px 0 0;cursor:pointer', label, idSuffix);
      node.type = 'button';
      return node;
    };
    var box = make(
      'div',
      'color-scheme:light dark;max-width:560px;margin:24px 16px;padding:16px 20px;border:1px solid GrayText;border-left:4px solid Highlight;border-radius:4px;background:Canvas;color:CanvasText;font:15px/1.5 system-ui,"Segoe UI",sans-serif;text-align:left',
      '',
      '',
    );
    box.id = 'startfail';
    box.setAttribute('role', 'alert');
    box.appendChild(make('h2', text + ';font-weight:600;font-size:1.15em', 'The page failed to start.'));
    box.appendChild(make('p', text, 'Something went wrong while the page was loading. Reloading may fix it.'));
    box.appendChild(
      make(
        'pre',
        'margin:8px 0 12px;padding:8px 12px;border:1px solid GrayText;border-radius:4px;font:13px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:8em;overflow:auto',
        errors[0],
        '-error',
      ),
    );
    var reload = button('-reload', 'Reload');
    reload.onclick = function () {
      location.reload();
    };
    box.appendChild(reload);

    if (keys === null) {
      box.appendChild(
        make(
          'p',
          text + ';margin-top:12px',
          'This browser does not let the page read its saved data, so there is no reset button.',
          '-blocked',
        ),
      );
    } else if (!keys.length) {
      box.appendChild(
        make(
          'p',
          text + ';margin-top:12px',
          'No saved data was found in this browser, so there is nothing to reset. The error above and the browser console (F12) say what failed.',
          '-none',
        ),
      );
    } else {
      var reset = make('div', 'margin-top:16px;padding-top:12px;border-top:1px solid GrayText');
      reset.appendChild(make('h3', text + ';font-weight:600', 'If it fails again, reset the saved data'));
      reset.appendChild(
        make(
          'p',
          text,
          'The page keeps your sheets, gear sets and settings in this browser. A damaged copy can stop the page from starting. Resetting deletes all of it and cannot be undone.',
        ),
      );
      var ask = button('-ask', 'Reset saved data…');
      var confirm = make('div', 'margin-top:8px;display:none', '', '-confirm');
      var question = make('p', text);
      question.appendChild(make('b', '', 'Delete every saved sheet, gear set and setting in this browser?'));
      question.appendChild(document.createTextNode(' The page then reloads empty.'));
      var remove = button('-do', 'Delete saved data');
      var cancel = button('-cancel', 'Cancel');
      ask.onclick = function () {
        confirm.style.display = 'block';
      };
      cancel.onclick = function () {
        confirm.style.display = 'none';
      };
      remove.onclick = function () {
        try {
          var all = savedKeys() || [];
          for (var i = 0; i < all.length; i++) {
            localStorage.removeItem(all[i]);
          }
        } catch (e) {
          // the reload shows the message again
        }
        location.reload();
      };
      confirm.appendChild(question);
      confirm.appendChild(remove);
      confirm.appendChild(cancel);
      reset.appendChild(ask);
      reset.appendChild(confirm);
      box.appendChild(reset);
    }
    for (var j = 0; j < document.body.children.length; j++) {
      document.body.children[j].style.setProperty('display', 'none', 'important');
    }
    document.body.insertBefore(box, document.body.firstChild);
  }

  addEventListener('error', onError);
  addEventListener('unhandledrejection', onError);
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      removeEventListener('error', onError);
      removeEventListener('unhandledrejection', onError);
      var root = document.querySelector('gsa-app');
      var built = document.documentElement.hasAttribute('data-started') && Boolean(root) && root.childElementCount > 0;
      if (built && !errors.length) {
        release(); // the page started
        return;
      }
      if (!errors.length) {
        errors.push('The page was not built: its script did not run, or did not finish. The file may be incomplete.');
      }
      show();
      release();
    }, 0);
  });
})();
