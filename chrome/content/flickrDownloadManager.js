var FlickrDownloadManagerListener =  
{  
  init: function()
  {
    this.progressBar = document.getElementById("imageProgress");
  },

  QueryInterface: function(aIID)  
  {  
   if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||  
       aIID.equals(Components.interfaces.nsISupportsWeakReference) ||  
       aIID.equals(Components.interfaces.nsISupports))  
     return this;  
   throw Components.results.NS_NOINTERFACE;  
  },  
  
  onStateChange: function(aWebProgress, aRequest, aFlag, aStatus)
  {
   if(aFlag & Components.interfaces.nsIWebProgressListener.STATE_START)  
   {  
     // This fires when the load event is initiated  
   }  
   if(aFlag & Components.interfaces.nsIWebProgressListener.STATE_STOP)  
   {  
     // This fires when the load finishes
     FlickrDownloadManager.downloadNextImage();
   }  
  },  
  
  onLocationChange: function(aProgress, aRequest, aURI) {},  
  onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot) 
  {
    this.progressBar.setAttribute("max", maxSelf);
    this.progressBar.setAttribute("value", curSelf);
  },  
  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) { },  
  onSecurityChange: function(aWebProgress, aRequest, aState) { }  
}  

var FlickrDownloadManager; if (FlickrDownloadManager == null) FlickrDownloadManager = {
  init: function() 
  {
    this.setData = {};
    FlickrOAuth.setFlickrUpdateCb(function(s, m, d) {FlickrDownloadManager.flickrUpdate(s, m, d)});

    //FlickrDownloadManager.authorizeFlickr();
    return;
    if (this.setTitle != null)
    {
      alert("A set is already being downloaded: " + this.setTitle);
      return;
    }
    this.saveDir = window.arguments[0];
    this.setTitle = window.arguments[1];
    this.photoIds = window.arguments[2];
    this.photoIdx = 0;
    this.request = null;

    // create directory to save to
    if (! FlickrDownloadManager.createSaveDir())
    {
      window.close();
      return false;
    }

    FlickrDownloadManagerListener.init();

    FlickrDownloadManager.downloadNextImage();
    return;
  },

  downloadSet: function(setId, userName)
  {
    this.setId = setId;
    this.userName = userName;
    FlickrOAuth.authenticate(userName, function(status) {FlickrDownloadManager.authenticateCb(status)});
    // get photos
    // FlickrOAuth.flickrCallMethod("flickr.photosets.getPhotos", {photoset_id:"72157627601593559", extras:"url_sq,url_z,url_l,url_o"});
  },

  authenticateCb: function(status)
  {
    Application.console.log("SetId: " + this.setId);
    if (!status)
    {
      alert("Authentication failed");
      return;
    }
    FlickrOAuth.flickrCallMethod("flickr.photosets.getInfo", {photoset_id:this.setId});
    // FlickrOAuth.flickrCallMethod("flickr.photosets.getPhotos", {photoset_id:this.setId, extras:"url_sq,url_z,url_l,url_o"});
  },
  
  createSaveDir: function(baseSaveDir, setName) 
  {
    if (!baseSaveDir.isDirectory())
    {
      alert("The chosen directory does not exist! " + this.saveDir.path);
      return null;
    }
    var saveDir = baseSaveDir.clone();
    saveDir.append(setName);
    if (!saveDir.exists())
    {
      try
      {
        saveDir.create(saveDir.DIRECTORY_TYPE, 0775);
      } catch (e)
      {
        Application.console.log("Error message: " + e.message);
        alert("Could not create the directory '" + saveDir.path + "'");
        return null;
      }
    }
    else if (!saveDir.isDirectory())
    {
      for (var i = 1; i < 1000; i++)
      {
        saveDir = baseSaveDir.clone();
        saveDir.append(this.setTitle +'_' + i);
        if (!this.saveDir.exists())
        {
          try
          {
            saveDir.create(saveDir.DIRECTORY_TYPE, 0775);
            break;
          } catch (e)
          {
            Application.console.log("Error message: " + e.message);
            alert("Could not create the directory '" + saveDir.path + "'");
            return null;
          }
        }
        else if (saveDir.isDirectory())
        {
          break;
        }
      }
    }
    return saveDir;
  },

  flickrUpdate: function(status, method, data)
  {
    Application.console.log("FlickrUpdate data received for method: " + method);
    if (!status)
    {
      Application.console.log("Failed to get a result for method " + method + "\n" + data);
      return;
    }
    switch (method)
    {
    case "flickr.photosets.getInfo":
      if (data.stat && data.stat == "fail")
      {
        Application.console.log("Failed to get information for this set: " + method);
        break;
      }
      var baseSaveDir = FlickrDownloadManager.getBaseSaveDir();
      if (!baseSaveDir)
      {
        Application.console.log("Choosing saving directory has been canceled");
        break;
      }
      var saveDir = FlickrDownloadManager.createSaveDir(baseSaveDir, data.photoset.title._content);
      if (!saveDir)
      {
        Application.console.log("Failed to create save directory");
        break;
      }
      // save the data
      this.setData[data.photoset.id] = {title:data.photoset.title._content, saveDirectory:saveDir};
      break;
    default:
      Application.console.log("Got a flickr update for an unknown method: " + method);
    }
  },

  getBaseSaveDir: function()
  {
    // get the output directory to save the files to
    var nsIFilePicker = Components.interfaces.nsIFilePicker;
    var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, "Save images to...", nsIFilePicker.modeGetFolder);

    // get the previously used dir from preferences
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                    .getService(Components.interfaces.nsIPrefService);
    prefs = prefs.getBranch("extensions.FlickrGetSet.");
    try
    {
      var saveDir = prefs.getComplexValue("saveDir", Components.interfaces.nsILocalFile);
      fp.displayDirectory = saveDir;
    } catch (e){}

    if (fp.show() != nsIFilePicker.returnOK)
    {
      return null;
    }
    // save the chosen directory
    prefs.setComplexValue("saveDir",
                          Components.interfaces.nsILocalFile, fp.file);
    return fp.file;
  }

  downloadNextImage: function()
  {
    var totalProgress = document.getElementById("totalProgress");
    totalProgress.setAttribute("max", this.photoIds.length);
    totalProgress.setAttribute("value", this.photoIdx);
    if (this.photoIdx >= this.photoIds.length)
    {
      try
      {
        this.saveDir.reveal();
      }
      catch(e)
      {
        Application.console.log("reveal is not supported on this platform");
      }
      window.close();
      return;
    }
    var photoId = this.photoIds[this.photoIdx];
    this.photoIdx ++;
    //FlickrDownloadManager.getInfo(photoId);
    FlickrDownloadManager.getSizesPage(photoId);
  },

  getSizesPage: function(photoId)
  {
    Application.console.log("Get sizes page for " + photoId);
    var targetDir = this.saveDir.clone();
    var request = new XMLHttpRequest();
    this.request = request;  
    request.open("GET", "http://www.flickr.com/photos/eljeffe/"+photoId+"/sizes/o/", true);
    request.onreadystatechange = function (aEvt) 
    {  
      if (request.readyState == 4)
      {
        if (request.status != 200)
        {

          Application.console.log('Error', request.statusText);
          FlickrDownloadManager.downloadNextImage();
          return;
        }
        htmlResponse = request.responseText;

        // init title to PhotoId, in case the title can not be found
        var title = photoId;
        var matchArray = /<meta name="title" content="(.*)">/.exec(htmlResponse);
        if (matchArray != null)
        {
          var title = matchArray[1];
        }
        else
        {
          Application.console.log("Failed to retrieve the title of the photo with ID " + photoId);
        }
        var matchArray = /<div id="allsizes-photo">\s*<img src="(.*)">/.exec(htmlResponse);
        var imageSrc = null;
        if (matchArray != null)
        {
          imageSrc = matchArray[1];
        }
        else
        {
          Application.console.log("Failed to retrieve the original of the photo with ID " + photoId);
        }
        document.getElementById("imageName").setAttribute("value", "Downloading " + title);
        if (imageSrc == null)
        {
          alert("Failed to find the original photo for '" + title +"' with ID " + photoId);
          FlickrDownloadManager.downloadNextImage();
          return;
        }

        Application.console.log(title + " " + imageSrc);

        // download the file
        var imageUri = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newURI(imageSrc, null, null);

        var origExt = /[a-zA-Z0-9]+$/.exec(imageSrc)[0];
        Application.console.log("origExt:" + origExt);

        var targetFile = targetDir.clone();
        targetFile.append(title+"."+origExt);
        if (targetFile.exists())
        {
          Application.console.log("The image already exists. Skip downloading. " + targetFile.path);
          FlickrDownloadManager.downloadNextImage();
          return;
        }
        // create the file
        targetFile.create(targetFile.NORMAL_FILE_TYPE, 0644);

        //new persitence object  
        var obj_Persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);  
        
        // with persist flags if desired  
        const nsIWBP = Components.interfaces.nsIWebBrowserPersist;  
        const flags = nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES;  
        obj_Persist.persistFlags = flags | nsIWBP.PERSIST_FLAGS_FROM_CACHE;  
        // set listener
        obj_Persist.progressListener = FlickrDownloadManagerListener;
        
        //save file to target  
        obj_Persist.saveURI(imageUri,null,null,null,null,targetFile); 

      }
    }
    request.send(null);
  },


  getInfo: function(photoId)
  {
    var targetDir = this.saveDir.clone();

    var request = new XMLHttpRequest();  
    request.open('GET', 'http://api.flickr.com/services/rest/?method=flickr.photos.getInfo&api_key=fb83db48de20585d51c21052562dc3ae&photo_id='+photoId, true);
    request.onreadystatechange = function (aEvt) 
    {  
      if (request.readyState == 4)
      {
        if (request.status != 200)
        {

          Application.console.log('Error', request.statusText);
          FlickrDownloadManager.downloadNextImage();
          return;
        }
        var xmlResponse = request.responseXML;
        var photoTags = xmlResponse.getElementsByTagName("photo");
        if (photoTags.length != 1)
        {
          Application.console.log("Oops! could not get photo tag from info for "+ photoId +". Response: \n" + request.responseText);
          FlickrDownloadManager.downloadNextImage();
          return;
        }
        var photoTag = photoTags[0];
        try
        {
          var farm = photoTag.getAttribute("farm");
          var server = photoTag.getAttribute("server");
          var secret = photoTag.getAttribute("secret");
          var origSecret = null;
          var origExt = null;
          if (photoTag.hasAttribute("originalsecret"))
          {
            origSecret = photoTag.getAttribute("originalsecret");
            origExt = photoTag.getAttribute("originalformat");
          }
        } catch (e)
        {
          alert("failed to parse photo data " + e.message);
          FlickrDownloadManager.downloadNextImage();
          return;
        }
        var titleTags = xmlResponse.getElementsByTagName("title");
        if (photoTags.length != 1)
        {
          Application.console.log("Oops! could not get title tag from info");
          FlickrDownloadManager.downloadNextImage();
          return;
        }
        var title = titleTags[0].textContent;

        var squareUrl = "http://farm"+farm+".static.flickr.com/"+server+"/"+photoId+"_"+secret+"_s.jpg";
        var imageUrl;
        if (origSecret)
        {
          imageUrl = "http://farm"+farm+".static.flickr.com/"+server+"/"+photoId+"_"+origSecret+"_o."+origExt;
        }
        else
        {
          imageUrl = "http://farm"+farm+".static.flickr.com/"+server+"/"+photoId+"_"+secret+"_b.jpg";
        }

        // set the image in the dialog
        document.getElementById("imageThumb").setAttribute("src", squareUrl);
        document.getElementById("imageName").setAttribute("value", "Downloading " + title);

        // download the file
        var imageUri = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newURI(imageUrl, null, null);
        var targetFile = targetDir.clone();
        if (origExt)
        {
          targetFile.append(title+"."+origExt);
        }
        else
        {
          targetFile.append(title+".jpg");
        }
        if (targetFile.exists())
        {
          Application.console.log("The image already exists. Skip downloading. " + targetFile.path);
          FlickrDownloadManager.downloadNextImage();
          return;
        }
        // create the file
        targetFile.create(targetFile.NORMAL_FILE_TYPE, 0644);

        //new persitence object  
        var obj_Persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);  
        
        // with persist flags if desired  
        const nsIWBP = Components.interfaces.nsIWebBrowserPersist;  
        const flags = nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES;  
        obj_Persist.persistFlags = flags | nsIWBP.PERSIST_FLAGS_FROM_CACHE;  
        // set listener
        obj_Persist.progressListener = FlickrDownloadManagerListener;
        
        //save file to target  
        obj_Persist.saveURI(imageUri,null,null,null,null,targetFile); 
      }
    };  
    request.send(null); 
  },

  authorizeFlickr: function() {
    Application.console.log('Authorize flickr');
    var url = "http://www.flickr.com/services/oauth/request_token";
    var accessor = {
      //token: "",
      //tokenSecret: "",
     consumerKey : "fb83db48de20585d51c21052562dc3ae",
      consumerSecret: "4cafb2345ff39878"
    };

    var message = {
      action: url,
      method: "GET",
      parameters: [
        ["oauth_signature_method", "HMAC-SHA1"],
        ["oauth_version", "1.0"],
      ["oauth_callback", "http%3A%2F%2Fwww.cloudscratcher.be"]
//    ["oauth_nonce", "89601180"],
//    ["oauth_timestamp", "1305583298"],
//    ["oauth_consumer_key", "653e7a6ecc1d528c516cc8f92cf98611"]

      ]
    };

    OAuth.completeRequest(message, accessor);
//  OAuth.setParameter(message, "oauth_nonce", "89601180");
//  OAuth.setParameter(message, "oauth_timestamp", "1305583298");
//  OAuth.setParameter(message, "oauth_consumer_key", "653e7a6ecc1d528c516cc8f92cf98611");
//
//  OAuth.SignatureMethod.sign(message, accessor);
//  return;
//  Application.console.log("Base string: " + OAuth.SignatureMethod.getBaseString(message));
    for (var p in message.parameters) {  
            Application.console.log(p + ':' + message.parameters[p]);
    } 
//  return;
//  for (var p = 0; p < message.parameters.length; ++p) {
//    if (message.parameters[p][0] == "oauth_signature")
//    {
//      message.parameters.splice(p, 1)
//    }
//  }
//
//
//
//  message.parameters = message.parameters.sort();
//
//  // sign agian with the sorted parameters
//  OAuth.SignatureMethod.sign(message, accessor);
//  for (var p in message.parameters) {
//          Application.console.log(p + ':' + message.parameters[p]);
//  }
//  Application.console.log("Base string: " + OAuth.SignatureMethod.getBaseString(message));


    url = url + '?' + OAuth.formEncode(message.parameters);
    Application.console.log(url);
    var request = new XMLHttpRequest();  
    request.open('GET', url, false);
    request.send(null);

    if (request.status == 200)
    {
      Application.console.log(request.responseText);
      var result = OAuth.getParameterMap(request.responseText);
      for (var p in result) 
      {  
         Application.console.log(p + ':' + result[p]);
      }
      
      accessor["token"] = result["oauth_token"];
      accessor["tokenSecret"] = result["oauth_token_secret"];
      message["action"] = "http://www.flickr.com/services/oauth/authorize";

      var authorizeUrl="http://www.flickr.com/services/oauth/authorize?oauth_token="+result["oauth_token"]+"&perms=read";
      Application.console.log(authorizeUrl);
    }
    else
    {
      Application.console.log("Status: " + request.status);
      Application.console.log(request.responseText);
    }

  },

  exit: function() {
    Application.console.log('Exiting');
    this.photoIdx = this.photoIds.length;
    if (this.request)
    {
      Application.console.log('aborting request');
      this.request.abort();
    }
    window.close();
  },
}

FlickrDownloadManager.init();

