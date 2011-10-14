var EXPORTED_SYMBOLS = ["FlickrOAuth"];

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://flickrgetset/content/oauth.jsm");

// this is the interface to the outside
var FlickrOAuth =
{
  setFlickrUpdateCb: setFlickrUpdateCb,
  setAuthenticateCb: setAuthenticateCb,
  authenticate: authenticate,
  flickrCallMethod: flickrCallMethod,
}

// global variables
var flickrUpdateCb = null;
var authenticateCb = null;


/**
 * Set the callback function that will be called when a flickr method call has finished
 * 
 * @author jef (10/13/2011)
 * 
 * @param cb 
 */
function setFlickrUpdateCb(cb)
{
  flickrUpdateCb = cb;
};

/**
 * Set the callback function that will be called when authentication has finished
 * 
 * @author jef (10/13/2011)
 * 
 * @param cb 
 */
function setAuthenticateCb(cb)
{
  authenticateCb = cb;
};

/**
 * Authenticate a user with Flickr
 * 
 * @author jef (10/14/2011)
 * 
 * @param oAuthData OAuth signing data
 */
function authenticate(oAuthData)
{
  // make sure that the token is null
  oAuthData["token"] = null;
  oAuthData["tokenSecret"] = null;

  if (!oAuthData.userName)
  {
    log("Not authentication needed");
    authenticateCb(true, oAuthData);
    return;
  }
  var authenticationTokenList = getAuthToken(oAuthData.userName);
  if (authenticationTokenList)
  {
    oAuthData["token"] = authenticationTokenList[0];
    oAuthData["tokenSecret"] = authenticationTokenList[1];

    // test if the token is still approved
    if (testLogin(oAuthData))
    {
      authenticateCb(true, oAuthData);
      return;
    }
    else
    {
      removeAuthToken(oAuthData.userName);
      oAuthData["token"] = null;
      oAuthData["tokenSecret"] = null;
    }
  }

  log("TODO: Ask if authentication is needed");

  // request token
  var result = flickrCall(oAuthData, "http://www.flickr.com/services/oauth/request_token",{oauth_callback:"oob"}, false, false);
  if (!result)
  {
    logError("Failed to get a request token");
    authenticateCb(false, oAuthData);
    return;
  }
  // save the token and token secret
  oAuthData["token"] = result["oauth_token"];
  oAuthData["tokenSecret"] = result["oauth_token_secret"];

  // request authorization
  var authorizeUrl="http://www.flickr.com/services/oauth/authorize?oauth_token="+result["oauth_token"]+"&perms=read";
  var params = {url:authorizeUrl};
  var params = {url:authorizeUrl, verifCallback:setVerificationCode, oAuthData:oAuthData};
  var window = Services.wm.getMostRecentWindow(null);
  window.openDialog("chrome://flickrgetset/content/authenticateDialog.xul",  
                    "authenticate-dialog", "chrome,centerscreen,dialog", params);

};

/**
 * Callback from authenticateDialog to set the verification code
 * 
 * @author jef (10/14/2011)
 * 
 * @param verificationCode The verification code
 * @param status False if canceled
 * @param oAuthData OAuth signing data
 */
function setVerificationCode(verificationCode, status, oAuthData)
{
  if (!status)
  {
    log("Verification was canceled by user");
    authenticateCb(false, oAuthData);
    return;
  }

  // exchange the request token for an access token

  var result = flickrCall(oAuthData, "http://www.flickr.com/services/oauth/access_token",{oauth_verifier:verificationCode}, false, false);
  if (!result)
  {
    logError("Failed to get the access token");
    authenticateCb(false, oAuthData);
    return;
  }
  var userId = result["user_nsid"];
  var userName = result["username"];

  if (userId == "")
  {
    logError("Authorization failed");
    oAuthData["token"] = null;
    oAuthData["tokenSecret"] = null;
    authenticateCb(false, oAuthData);
    return;
  }
  // save the access token
  oAuthData["token"] = result["oauth_token"];
  oAuthData["tokenSecret"] = result["oauth_token_secret"];
  saveAuthToken(userName, oAuthData["token"], oAuthData["tokenSecret"]);

  // test if the login is ok
  authenticateCb(testLogin(oAuthData), userName);
};

/**
 * Test if the OAuth signing data is authorized by Flickr
 * 
 * @author jef (10/14/2011)
 * 
 * @param oAuthData OAuth signing data
 */
function testLogin(oAuthData)
{
  var result = flickrCall(oAuthData, "http://api.flickr.com/services/rest",{method:"flickr.test.login"}, true, false);
  if (!result || result.stat != "ok")
  {
    return false;
  }
  return true;
};

/**
 * Call a Flickr method
 * 
 * @author jef (10/14/2011)
 * 
 * @param oAuthData OAuth signing data
 * @param method The method to be called
 * @param extraParams extra params that should be added to the call
 */
function flickrCallMethod(oAuthData, method, extraParams)
{
  log("flickrCallMethod " + method);
  extraParams["method"] = method;
  flickrCall(oAuthData, "http://api.flickr.com/services/rest",extraParams, true, true);
};

/**
 * A flickr call
 *  
 * If the call is synchronous, the result will be returned by this method. 
 * If the call is asynchronous, the result is returned through the flickrUpdateCb callback 
 *  
 * @author jef (10/14/2011)
 * 
 * @param oAuthData OAuth signing data
 * @param url The base url for the call
 * @param extraParams extra params that should be added to the call
 * @param returnJson True if the result should be returned as JSON
 * @param async True if the call should be done asynchronously
 */
function flickrCall(oAuthData, url, extraParams, returnJson, async)
{
  var accessor = {
    consumerKey : oAuthData["consumerKey"],
    consumerSecret: oAuthData["consumerSecret"]
  };

  if (oAuthData["token"])
  {
    accessor["token"] = oAuthData["token"];
  }
  if (oAuthData["tokenSecret"])
  {
    accessor["tokenSecret"] = oAuthData["tokenSecret"];
  }

  var message = {
    action: url,
    method: "GET",
    parameters: {
                  oauth_signature_method: "HMAC-SHA1",
                  oauth_version: "1.0"
    }
  };
  if (extraParams)
  {
    for (var p in extraParams)
    {
      OAuth.setParameter(message, p, extraParams[p]);
    }
  }
  if (returnJson)
  {
    OAuth.setParameter(message, "format", "json");
    OAuth.setParameter(message, "nojsoncallback", "1");
  }


  OAuth.completeRequest(message, accessor);

  var url = message["action"] + '?' + OAuth.formEncode(message.parameters);
  var request = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                     .createInstance(Components.interfaces.nsIXMLHttpRequest);
  if (async)
  {
    request.open('GET', url, false);
    request.onreadystatechange = function ()
    {
      if (request.readyState == 4)
      {
        var method = extraParams["method"];
        if (request.status != 200)
        {
          flickrUpdateCb(false, method, extraParams, oAuthData);
        }
        else
        {
          flickrUpdateCb(true, method, JSON.parse(request.responseText), oAuthData);
        }
      }
    }
    request.send(null);
  }
  else
  {
    request.open('GET', url, false);
    request.send(null);

    if (request.status == 200)
    {
      if (!returnJson)
      {
        var result = OAuth.getParameterMap(request.responseText);
        return result;
      }
      else
      {
        return JSON.parse(request.responseText);
      }
    }
    else
    {
      logError("Call failed for action: " + message["action"] + "\nStatus: " + request.status + "\nResponse:\n" + request.responseText);
      return null;
    }
  }
};

/**
 * Try to get an existing authorization token from the login manager
 * 
 * @author jef (10/14/2011)
 * 
 * @param userName 
 */
function getAuthToken(userName)
{
  var loginManager = Components.classes["@mozilla.org/login-manager;1"].  
                     getService(Components.interfaces.nsILoginManager); 
  var logins = loginManager.findLogins({}, "chrome://FlickrGetSet", null, "Authentication key");  
  
  // Find user from returned array of nsILoginInfo objects  
  for (var i = 0; i < logins.length; i++)
  {
    if (logins[i].username == userName)
    {
      var password = logins[i].password; 
      return password.split(":"); 
    }
  }
  return null;
};

/**
 * Save an authorization code to the login manager
 * 
 * @author jef (10/14/2011)
 * 
 * @param userName 
 * @param token 
 * @param tokenSecret 
 */
function saveAuthToken(userName, token, tokenSecret)
{
  // remove password if there already is one defined
  removeAuthToken(userName);
  // save new login
  var loginManager = Components.classes["@mozilla.org/login-manager;1"].  
                     getService(Components.interfaces.nsILoginManager);
  var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",  
                                               Components.interfaces.nsILoginInfo,  
                                               "init");
  var loginInfo = new nsLoginInfo("chrome://FlickrGetSet", null, "Authentication key",  
                                  userName, token + ":" + tokenSecret, "", "");
  loginManager.addLogin(loginInfo);
};

/**
 * remove an authorization code from the login manager
 * 
 * @author jef (10/14/2011)
 * 
 * @param userName 
 */
function removeAuthToken(userName)
{
  var loginManager = Components.classes["@mozilla.org/login-manager;1"].  
                     getService(Components.interfaces.nsILoginManager);
  var logins = loginManager.findLogins({}, "chrome://FlickrGetSet", null, "Authentication key");  
  for (var i = 0; i < logins.length; i++)
  {
    if (logins[i].username == userName)
    {
      loginManager.removeLogin(logins[i]);
      return;
    }
  }
};

/**
 * Helper to log messages
 * 
 * @author jef (10/14/2011)
 * 
 * @param msg 
 */
function log(msg)
{
  Services.console.logStringMessage(msg);
};

/**
 * Helper to log errors
 * 
 * @author jef (10/14/2011)
 * 
 * @param msg 
 */
function logError(msg)
{
  Services.console.logStringMessage("ERROR: " + msg);
};

