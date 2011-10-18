/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is a module to manage Flickr oauth calls.
 *
 * The Initial Developer of the Original Code is
 * CloudScratcher BVBA.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Jef Steelant <flickrgetset@cloudscratcher.be>
 *
 * ***** END LICENSE BLOCK ***** */

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
  oAuthData.token = null;
  oAuthData.tokenSecret = null;

  if (!oAuthData.userName)
  {
    log("Not authentication needed");
    authenticateCb(true, oAuthData);
    return;
  }
  var authenticationTokenList = getAuthToken(oAuthData.userName);
  if (authenticationTokenList)
  {
    oAuthData.token = authenticationTokenList[0];
    oAuthData.tokenSecret = authenticationTokenList[1];

    // test if the token is still approved
    flickrCall(oAuthData, "http://api.flickr.com/services/rest",{method:"flickr.test.login"}, true, testLoginCb);
    return;
  }

  var res = Services.prompt.confirm(null, "Authenticate", "You are logged in on Flickr as '" + oAuthData.userName + "'. Do you want to authenticate FlickrGetSet for read access? If not, only public photos from the set will be downloaded.");

  if (!res)
  {
    oAuthData.token = null;
    oAuthData.tokenSecret = null;
    oAuthData.userName = "";
    authenticateCb(true, oAuthData);
    return;
  }

  // request token
  flickrCall(oAuthData, "http://www.flickr.com/services/oauth/request_token", {oauth_callback:"oob"}, false, requestTokenCb);

};

function requestTokenCb(status, method, data, oAuthData)
{
  if (!status)
  {
    promptWarning("Failed to request token");
    authenticateCb(false, oAuthData);
    return;
  }
  var result = OAuth.getParameterMap(data);
  if (!result)
  {
    promptWarning("Failed to request token 2");
    authenticateCb(false, oAuthData);
    return;
  }
  // save the token and token secret
  oAuthData.token = result.oauth_token;
  oAuthData.tokenSecret = result.oauth_token_secret;

  // request authorization
  var authorizeUrl="http://www.flickr.com/services/oauth/authorize?oauth_token=" + result.oauth_token + "&perms=read";
  var params = {url:authorizeUrl};
  var params = {url:authorizeUrl, verifCallback:setVerificationCode, oAuthData:oAuthData};
  var window = Services.wm.getMostRecentWindow("navigator:browser");
  window.openDialog("chrome://flickrgetset/content/authenticateDialog.xul",  
                    "authenticate-dialog", "chrome,centerscreen,dialog", params);
}

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

  flickrCall(oAuthData, "http://www.flickr.com/services/oauth/access_token",{oauth_verifier:verificationCode}, false, accessTokenCb);
};

function accessTokenCb(status, method, data, oAuthData)
{
  if (!status)
  {
    promptWarning("Failed to get access token");
    authenticateCb(false, oAuthData);
    return;
  }
  var result = OAuth.getParameterMap(data);
  if (!result)
  {
    promptWarning("Failed to get access token 2");
    authenticateCb(false, oAuthData);
    return;
  }
  var userId = result.user_nsid;
  var userName = result.username;

  if (userId == "")
  {
    logError("Authorization failed");
    oAuthData.token = null;
    oAuthData.tokenSecret = null;
    authenticateCb(false, oAuthData);
    return;
  }
  // save the access token
  oAuthData.token = result.oauth_token;
  oAuthData.tokenSecret = result.oauth_token_secret;
  saveAuthToken(userName, oAuthData.token, oAuthData.tokenSecret);

  authenticateCb(true, oAuthData);
}


/**
 * Check if the testlogin succeeded. If not, the authentication process is called again.
 * 
 * @author jef (10/18/2011)
 * 
 * @param status 
 * @param method 
 * @param data 
 * @param oAuthData 
 */
function testLoginCb(status, method, data, oAuthData)
{
  if (!status)
  {
    promptWarning("Calling " + method + "failed");
    authenticateCb(false, oAuthData);
    return;
  }
  var result = JSON.parse(data);
  if (!result || result.stat != "ok")
  {
    removeAuthToken(oAuthData.userName);
    authenticate(oAuthData);
    return;
  }
  authenticateCb(true, oAuthData);
}

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
  extraParams.method = method;
  return flickrCall(oAuthData, "http://api.flickr.com/services/rest",extraParams, true, flickrUpdateCb);
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
function flickrCall(oAuthData, url, extraParams, returnJson, callBack)
{
  var accessor = {
    consumerKey : oAuthData.consumerKey,
    consumerSecret: oAuthData.consumerSecret
  };

  if (oAuthData.token)
  {
    accessor.token = oAuthData.token;
  }
  if (oAuthData.tokenSecret)
  {
    accessor.tokenSecret = oAuthData.tokenSecret;
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

  var url = message.action + '?' + OAuth.formEncode(message.parameters);
  var method = null;
  if (extraParams.hasOwnProperty("method"))
  {
    method = extraParams.method;
  }
  Services.wm.getMostRecentWindow("navigator:browser").setTimeout(function(){callAsync(url, method, oAuthData, callBack);}, 0);
};

/**
 * Initiate an asynchronous call 
 *  
 * @author jef (10/18/2011)
 * 
 * @param url 
 * @param method 
 * @param oAuthData 
 * @param callBack 
 */
function callAsync(url, method, oAuthData, callBack)
{
  var request = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                     .createInstance();
  request.open('GET', url, true);
  request.onreadystatechange = function ()
  {
    if (request.readyState == 4)
    {
      if (request.status != 200)
      {
        log("Status: " + request.status + " response: " + request.responseText);
        callBack(false, method, request.responseText, oAuthData);
      }
      else
      {
        callBack(true, method, request.responseText, oAuthData);
      }
    }
  }
  request.send(null);

}

/**
 * Try to get an existing authorization token from the login manager
 * 
 * @author jef (10/14/2011)
 * 
 * @param userName 
 */
function getAuthToken(userName)
{
  var logins = Services.logins.findLogins({}, "chrome://FlickrGetSet", null, "Authentication key");  
  
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
  var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",  
                                               Components.interfaces.nsILoginInfo,  
                                               "init");
  var loginInfo = new nsLoginInfo("chrome://FlickrGetSet", null, "Authentication key",  
                                  userName, token + ":" + tokenSecret, "", "");
  Services.logins.addLogin(loginInfo);
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
  var logins = Services.logins.findLogins({}, "chrome://FlickrGetSet", null, "Authentication key");  
  for (var i = 0; i < logins.length; i++)
  {
    if (logins[i].username == userName)
    {
      Services.logins.removeLogin(logins[i]);
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

/**
 * Helper to prompt warnings
 * 
 * @author jef (10/14/2011)
 * 
 * @param msg 
 */
function promptWarning(msg)
{
  log("WARNING: " + msg);
  Services.prompt.alert(null, "FlickrOauth warning", msg);
};

