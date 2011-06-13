// pjax.js
// copyright chris wanstrath, Will Meurer
// https://github.com/wlmeurer/prototype-pjax
// based on Chris Wanstrath's jquery-ajax, prototypified

var Pjax = (function(){
  
  // When called on a link, fetches the href with ajax into the
  // container specified as the first parameter or with the data-pjax
  // attribute on the link itself.
  //
  // Tries to make sure the back button and ctrl+click work the way
  // you'd expect.
  //
  // Accepts ajax options object that may include these
  // pjax specific options:
  //
  // container - Where to stick the response body. Usually a String selector.
  //             $(container).update(xhr.responseBody)
  //      push - Whether to pushState the URL. Defaults to true (of course).
  //   replace - Want to use replaceState instead? That's cool.
  //
  // For convenience the first parameter can be either the container or
  // the options object.
  //
  // Returns the extended element
  Element.addMethods({
    pjax: function(element, container, options){
            if ( options ){
              options.container = container;
            } else {
              options = {container: container};
            }

            // We can't persist extended objects using the history API so we must use
            // a String selector. Bail if we have anything else.
            if ( typeof options.container !== 'string' ){
              throw "pjax container must be a string selector!"
              return false
            }

            return element.observe('click', function(event){
              // Middle click, cmd click, and ctrl click should open
              // links in a new tab as normal.
              if ( event.which > 1 || event.metaKey ){
                return true;
              }

              var defaults = {
                container: element.readAttribute('data-pjax'),
                clickedElement: element
              };

              new Pjax.Request(element.href, Object.extend(defaults, options));
              
              event.stop();
            });
          }
  });
  
  var pjax = {};
  
  // Loads a URL with ajax, puts the response body inside a container,
  // then pushState()'s the loaded URL.
  //
  // Acts like Ajax.Request (with options like method, onSuccess, etc).
  //
  // Accepts these extra keys:
  //
  // container - Where to stick the response body. Must be a String.
  //             $(container).update(xhr.responseBody)
  //      push - Whether to pushState the URL. Defaults to true (of course).
  //   replace - Want to use replaceState instead? That's cool.
  //
  // Use it like:
  //
  //   var request = new Pjax.Request(this.href, {container: 'main'});
  //   console.log( request.transport );
  //
  // Returns the underlying Ajax.Request object.
  pjax.Request = function(url, options) {
    var $container = $(options.container),
        success = options.onSuccess || Prototype.emptyFunction;

    // We don't want to let anyone override our success handler.
    delete options.onSuccess

    // We can't persist extended objects using the history API so we must use
    // a String selector. Bail if we got anything else.
    if ( typeof options.container !== 'string' ){
      throw "pjax container must be a string selector!";
    }

    var defaults = {
      push: true,
      replace: false,
      // We want the browser to maintain two separate internal caches: one for
      // pjax'd partial page loads and one for normal page loads. Without
      // adding this secret parameter, some browsers will often confuse the two.
      parameters: { _pjax: true },
      method: 'GET',
      requestHeaders: {
        'X-PJAX': 'true'
      },
      onFailure: function(response){
        window.location = url;
      },
      onComplete: function(response){
        document.fire('pjax:end', response);
      },
      onSuccess: function(response){
        var data = response.responseText;
        
        // If we got no data or an entire web page, go directly
        // to the page and let normal error handling happen.
        if ( !data.strip() || /<html/i.test(data) ) {
          return window.location = url;
        }

        // Make it happen.
        $container.update(data);

        // If there's a <title> tag in the response, use it as
        // the page's title.
        var oldTitle = document.title;
        var newTitle = $container.down('title');
        
        if( newTitle && (newTitle = newTitle.text.strip()) ) {
          newTitle.remove();
          document.title = newTitle;
        }

        var state = {
          pjax: options.container
        }

        // If there are extra params, save the complete URL in the state object
        var query = $H(options.parameters).toQueryString();
        if ( query != "_pjax=true" ) {
          state.url = url + (/\?/.test(url) ? "&" : "?") + query;
        } else {
          state.url = url;
        }

        if ( options.replace ) {
          window.history.replaceState(state, document.title, url);
        } else if ( options.push ) {
          // this extra replaceState before first push ensures good back
          // button behavior
          if ( !pjax.active ) {
            window.history.replaceState(Object.extend(state, {url:null}), oldTitle);
            pjax.active = true;
          }
          window.history.pushState(state, document.title, url);
        }

        // Google Analytics support
        if ( (options.replace || options.push) && window._gaq ) {
          _gaq.push(['_trackPageview']);
        }

        // If the URL has a hash in it, make sure the browser
        // knows to navigate to the hash.
        var hash = window.location.hash.toString();
        if ( hash !== '' ) {
          window.location.hash = '';
          window.location.hash = hash;
        }

        // Invoke their success handler if they gave us one.
        success.apply(this, arguments);
      }
    }

    options = Object.extend(defaults, options);

    if ( Object.isFunction(url) ) {
      url = url();
    }

    // Cancel the current request if we're already pjaxing
    var xhr = pjax.xhr;
    if ( xhr && xhr.readyState < 4) {
      xhr.onreadystatechange = Prototype.emptyFunction;
      xhr.abort();
    }

    xhr = new Ajax.Request(url, options);
    
    document.fire('pjax', options);

    return xhr;
  };
  
  // Used to detect initial (useless) popstate.
  // If history.state exists, assume browser isn't going to fire initial popstate.
  var popped = ('state' in window.history),
      initialURL = location.href;


  // popstate handler takes care of the back and forward buttons
  //
  // You probably shouldn't use pjax on pages with other pushState
  // stuff yet.
  window.onpopstate = function(event) {
    // Ignore inital popstate that some browsers fire on page load
    var initialPop = !popped && location.href == initialURL;
    popped = true;
    if ( initialPop ) {
      return;
    }

    var state = event.state;
    if ( state && state.pjax ) {
      var container = state.pjax;
      if ( $(container+'') ) {
        new Pjax.Request(state.url || location.href, {
          container: container,
          push: false
        });
      } else {
        window.location = location.href;
      }
    }
  };
  
  // Is pjax supported by this browser?
  pjax.supported = window.history && window.history.pushState;

  // Fall back to normalcy for older browsers.
  if ( !pjax.supported ) {
    pjax.Request = function( url, options ) {
      window.location = Object.isFunction(url) ? url() : url;
      return {};
    };
    Element.addMethods({
      pjax: function(element) {
        return element;
      }
    });
  }
  
  return pjax;
  
})();