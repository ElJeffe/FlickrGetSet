var EXPORTED_SYMBOLS = ["FlickrOAuth"];

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://flickrgetset/content/oauth.jsm");

// this is the interface to the outside
var FlickrOAuth =
{
  setFlickrUpdateCb: setFlickrUpdateCb,
  authenticate: authenticate,
}

// global variables
var consumerKey = "fb83db48de20585d51c21052562dc3ae";
var consumerSecret = "4cafb2345ff39878";
var token = null;
var tokenSecret = null;
var flickrUpdateCb = null;
var authenticateCb = null;
var authenticationNeeded = false;

function setFlickrUpdateCb(cb)
{
  flickrUpdateCb = cb;
}

function authenticate(userName, authCb)
{
  authCb(true, userName);
  // make sure that the token is null
  token = null;
  tokenSecret = null;
  authenticateCb = authCb;
  authenticateCb(true, "twee");

  if (!userName)
  {
    log("Not authentication needed");
    authenticationNeeded = false;
    autheticateCb(true, userName);
    return;
  }
  var authenticationTokenList = getAuthToken(userName);
  if (authenticationTokenList)
  {
    token = authenticationTokenList[0];
    tokenSecret = authenticationTokenList[1];
    log("Existing authentication token for user " + userName + " : " + token);

    // test if the token is still approved
    if (testLogin())
    {
      log("token is ok");
      autheticateCb(true, userName);
      return;
    }
    else
    {
      removeAuthToken(userName);
      token = null;
      tokenSecret = null;
    }
  }

  log("TODO: Ask if authentication is needed");

  // request token
  var result = flickrCall("http://www.flickr.com/services/oauth/request_token",{oauth_callback:"oob"}, false, false);
  if (!result)
  {
    logError("Failed to get a request token");
    autheticateCb(false, userName);
    return;
  }
  // save the token and token secret
  token = result["oauth_token"];
  tokenSecret = result["oauth_token_secret"];

  // request authorization
  var authorizeUrl="http://www.flickr.com/services/oauth/authorize?oauth_token="+result["oauth_token"]+"&perms=read";
  var params = {url:authorizeUrl};
  //var params = {url:authorizeUrl, verifCallback:this.setVerificationCode};
  window.openDialog("chrome://flickrgetset/content/authenticateDialog.xul",  
                    "authenticate-dialog", "chrome,centerscreen,dialog", params);

}

function setVerificationCode(verificationCode, status)
{
  log("params verif code: " + verificationCode + " status: " + status);
  log("Token: " + token);
  if (!status)
  {
    log("Verification was canceled by user");
    authenticateCb(false, userName);
    return;
  }

  // exchange the request token for an access token

  var result = FlickrOAuth.flickrCall("http://www.flickr.com/services/oauth/access_token",{oauth_verifier:verificationCode}, false, false);
  if (!result)
  {
    logError("Failed to get the access token");
    authenticateCb(false, userName);
    return;
  }
  var userId = result["user_nsid"];
  var userName = result["username"];

  if (userId == "")
  {
    logError("Authorization failed");
    token = null;
    tokenSecret = null;
    authenticateCb(false, userName);
    return;
  }
  // save the access token
  token = result["oauth_token"];
  tokenSecret = result["oauth_token_secret"];
  saveAuthToken(userName, token, tokenSecret);

  // test if the login is ok
  authenticateCb(testLogin(), userName);
}

function testLogin()
{
  var result = flickrCall("http://api.flickr.com/services/rest",{method:"flickr.test.login"}, true, false);
  if (!result || result.stat != "ok")
  {
    return false;
  }
  return true;
}

function flickrCallMethod(method, extraParams)
{
  extraParams["method"] = method;
  flickrCall("http://api.flickr.com/services/rest",extraParams, true, true);
}

function flickrCall(url, extraParams, returnJson, async)
{
  var accessor = {
    consumerKey : consumerKey,
    consumerSecret: consumerSecret
  };

  if (token)
  {
    accessor["token"] = token;
  }
  if (tokenSecret)
  {
    accessor["tokenSecret"] = tokenSecret;
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
    for (p in extraParams)
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

  for (p in message.parameters)
  {
    log(" " + p + " : " +  message.parameters[p])
  }

  var url = message["action"] + '?' + OAuth.formEncode(message.parameters);
  log(url);
  var request = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                     .createInstance(Components.interfaces.nsIXMLHttpRequest);
  if (async)
  {
    request.open('GET', url, false);
    request.onreadystatechange = function ()
    {
      if (request.readyState == 4)
      {
        log(request.responseText);
        var method = extraParams["method"];
        if (request.status != 200)
        {
          flickrUpdateCb(false, method, extraParams);
        }
        else
        {
          flickrUpdateCb(true, method, JSON.parse(request.responseText));
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
      log(request.responseText);
      if (!returnJson)
      {
        var result = OAuth.getParameterMap(request.responseText);
        for (var p in result)
        {
          log(p + ':' + result[p]);
        }
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
}

function getAuthToken(userName)
{
  log("Get authentication token for user " + userName);
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
}

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
}

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
}

function log(msg)
{
  Services.console.logStringMessage(msg);
}

function logError(msg)
{
  Services.console.logStringMessage("ERROR: " + msg);
}

