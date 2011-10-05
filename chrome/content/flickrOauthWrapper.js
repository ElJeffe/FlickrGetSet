

var FlickrOAuth; if (FlickrOAuth == null) FlickrOAuth = 
{
  init: function()
  {
    this.consumerKey = "fb83db48de20585d51c21052562dc3ae";
    this.consumerSecret = "4cafb2345ff39878";
    this.token = null;
    this.tokenSecret = null;
  },

  authenticate: function(userName)
  {
    // make sure that the token is null
    this.token = null;
    this.tokenSecret = null;

    if (!userName)
    {
      Application.console.log("Not authentication needed");
      this.authenticationNeeded = false;
      return true;
    }
    var authenticationTokenList = FlickrOAuth.getAuthToken(userName);
    if (authenticationTokenList)
    {
      this.token = authenticationTokenList[0];
      this.tokenSecret = authenticationTokenList[1];
      Application.console.log("Existing authentication token for user " + userName + " : " + this.token);

      var evt = document.createEvent('Event');  
      evt.initEvent("flickrUpdate", true, true);  
      document.getElementById("flickrEventSender").dispatchEvent(evt);

      // test if the token is still approved
      if (FlickrOAuth.testLogin())
      {
        Application.console.log("token is ok");
        return true;
      }
      else
      {
        FlickrOAuth.removeAuthToken(userName);
        this.token = null;
        this.tokenSecret = null;
      }
    }

    Application.console.log("TODO: Ask if authentication is needed");

    // request token
    var result = FlickrOAuth.flickrCall("http://www.flickr.com/services/oauth/request_token", {oauth_callback:"oob"});
    if (!result)
    {
      return false;
    }
    // save the token and token secret
    this.token = result["oauth_token"];
    this.tokenSecret = result["oauth_token_secret"];

    // request authorization
      var authorizeUrl="http://www.flickr.com/services/oauth/authorize?oauth_token="+result["oauth_token"]+"&perms=read";
      var params = {url:authorizeUrl, out:null};
      window.openDialog("chrome://flickrgetset/content/authenticateDialog.xul",  
                        "authenticate-dialog", "chrome,centerscreen,dialog,modal", params);
      if (params.out)
      {
        var verificationCode = params.out["verificationCode"];
        Application.console.log("params verif code: " + verificationCode);
      }
      else
      {
        Application.console.log("Authorization canceled by user");
        return false;
      }
      Application.console.log(verificationCode);

      // exchange the request token for an access token

      var result = FlickrOAuth.flickrCall("http://www.flickr.com/services/oauth/access_token", {oauth_verifier:verificationCode});
      if (!result)
      {
        return false;
      }
      var userId = result["user_nsid"];
      var userName = result["username"];

      Application.console.log(userId);

      if (userId == "")
      {
        Application.console.log("Authorization failed");
        this.token = null;
        this.tokenSecret = null;
        return false;

      }
      // save the access token
      this.token = result["oauth_token"];
      this.tokenSecret = result["oauth_token_secret"];
      FlickrOAuth.saveAuthToken(userName, this.token, this.tokenSecret);

      // test if the login is ok
      FlickrOAuth.testLogin();
  },

  testLogin: function()
  {
    var result = FlickrOAuth.flickrCall("http://api.flickr.com/services/rest", {method:"flickr.test.login"}, true);
    if (result.stat == "ok")
    {
      return true;
    }
    return false;
  },

  flickrCall: function(url, extraParams, returnJson)
  {
    var accessor = {
      consumerKey : this.consumerKey,
      consumerSecret: this.consumerSecret
    };

    if (this.token)
    {
      accessor["token"] = this.token;
    }
    if (this.tokenSecret)
    {
      accessor["tokenSecret"] = this.tokenSecret;
    }

    var message = {
      action: url,
      method: "GET",
      parameters: [
        ["oauth_signature_method", "HMAC-SHA1"],
        ["oauth_version", "1.0"]
      ]
    };
    for (p in extraParams)
    {
      OAuth.setParameter(message, p, extraParams[p]);
    }
    if (returnJson)
    {
      OAuth.setParameter(message, "format", "json");
      OAuth.setParameter(message, "nojsoncallback", "1");
    }


    OAuth.completeRequest(message, accessor);

    var url = message["action"] + '?' + OAuth.formEncode(message.parameters);
    Application.console.log(url);
    var request = new XMLHttpRequest();  
    request.open('GET', url, false);
    request.send(null);

    if (request.status == 200)
    {
      Application.console.log(request.responseText);
      if (!returnJson)
      {
        var result = OAuth.getParameterMap(request.responseText);
        for (var p in result) 
        {  
           Application.console.log(p + ':' + result[p]);
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
      Application.console.log("Call failes for action: " + message["action"] + "\nStatus: " + request.status + "\nResponse:\n" + request.responseText);
      return null;
    }
  },

  setVerificationCode: function(verificationCode)
  {
    Application.console.log("params verif code: " + verificationCode);
  },

  getAuthToken: function(userName)
    {
      Application.console.log("Get authentication token for user " + userName);
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
    },

    saveAuthToken: function(userName, token, tokenSecret)
    {
      // remove password if there already is one defined
      FlickrOAuth.removeAuthToken(userName);
      // save new login
      var loginManager = Components.classes["@mozilla.org/login-manager;1"].  
                         getService(Components.interfaces.nsILoginManager);
      var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",  
                                                   Components.interfaces.nsILoginInfo,  
                                                   "init");
      var loginInfo = new nsLoginInfo("chrome://FlickrGetSet", null, "Authentication key",  
                                      userName, token + ":" + tokenSecret, "", "");
      loginManager.addLogin(loginInfo);
    },

    removeAuthToken: function(userName)
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
  }

FlickrOAuth.init();
