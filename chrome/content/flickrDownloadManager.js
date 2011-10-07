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
    this.isDownloading = false;
    this.currentDownloadSet = null;
    this.downloadDialog = null;
    FlickrOAuth.setFlickrUpdateCb(function(s, m, d) {FlickrDownloadManager.flickrUpdate(s, m, d)});
    return;
  },

  downloadSet: function(setId, userName)
  {
    this.setId = setId;
    this.userName = userName;
    FlickrOAuth.authenticate(userName, function(status, userName) {FlickrDownloadManager.authenticateCb(status, userName)});
  },

  authenticateCb: function(status, userName)
  {
    if (!status)
    {
      alert("Authentication failed");
      return;
    }

    if (userName)
    {
      // save as default user if none exists
      var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                      .getService(Components.interfaces.nsIPrefService);
      prefs = prefs.getBranch("extensions.FlickrGetSet.");

      var defaultUser = null;
      try
      {
        defaultUser = prefs.getCharPref("defaultUser");
      } catch (e)
      {
        defaultUser = null;
      }
      if (!defaultUser)
      {
        prefs.setCharPref("defaultUser", userName);
      }
    }

    FlickrOAuth.flickrCallMethod("flickr.photosets.getInfo", {photoset_id:this.setId});
  },
  
  flickrUpdate: function(status, method, data)
  {
    Application.console.log("FlickrUpdate data received for method: " + method);
    if (!status)
    {
      Application.console.log("Failed to get a result for method " + method + "\n" + data);
      return;
    }

    if (data.stat && data.stat == "fail")
    {
      Application.console.log("Flickr call failed for: " + method + " Message: " + (data.message?data.message:""));
      return;
    }
    switch (method)
    {
    case "flickr.photosets.getInfo":
      FlickrDownloadManager.handleSetInfo(data);
      break;
    case "flickr.photosets.getPhotos":
      FlickrDownloadManager.handleSetPhotos(data);
      break;
    default:
      Application.console.log("Got a flickr update for an unknown method: " + method);
    }
  },

  handleSetInfo: function(data)
  {
    var setId = data.photoset.id;
    var setTitle = data.photoset.title._content;
    if (this.setData[setId])
    {
      alert("This set is already being downloaded");
      return;
    }
    var baseSaveDir = FlickrDownloadManager.getBaseSaveDir();
    if (!baseSaveDir)
    {
      Application.console.log("Choosing saving directory has been canceled");
      return;
    }
    var saveDir = FlickrDownloadManager.createSaveDir(baseSaveDir, setTitle);
    if (!saveDir)
    {
      Application.console.log("Failed to create save directory");
      return;
    }
    // save the data
    this.setData[setId] = {title:setTitle, saveDirectory:saveDir};
    // get the photos for this set
    FlickrOAuth.flickrCallMethod("flickr.photosets.getPhotos", {photoset_id:setId, extras:"url_sq,url_z,url_l,url_o"});

  },

  handleSetPhotos: function(data)
  {
    if (!data.photoset.photo)
    {
      alert("No photos could be retreived for the set");
      delete this.setData[data.photoset.id];
      return;
    }
    var photoList = [];
    // temp map to be sure that photo names are unique
    var photoNames = {};
    // add all photo info to a list
    for (var i = 0; i < data.photoset.photo.length; ++i)
    {
      var photo = data.photoset.photo[i];
      var photoName = photo.title;
      if (photoNames.hasOwnProperty(photoName))
      {
        var counter = 1;
        var newName = photoName + "_" + counter;
        while (photoNames.hasOwnProperty(newName))
        {
          counter++;
          newName = photoName + "_" + counter;
        }
        photoName = newName;
      }
      photoNames[photoName] = 1;
      var photoData = new Object();
      photoData.name = photoName;
      photoData.sqUrl = photo.url_sq;
      // get the biggest photo
      if (photo.url_o)
      {
        photoData.bigUrl = photo.url_o;
      }
      else if (photo.url_l)
      {
        photoData.bigUrl = photo.url_l;
      }
      else if (photo.url_z)
      {
        photoData.bigUrl = photo.url_z;
      }
      if (photoData.bigUrl)
      {
        photoList.push(photoData);
      }
      else
      {
        Application.console.log("Could not find a big url for " + photoName);
      }
    }
    if (photoList.length == 0)
    {
      alert("No high quality photos could be found for this set");
      delete this.setData[data.photoset.id];
      return;
    }
    this.setData[data.photoset.id].photoList = photoList;
    FlickrDownloadManager.addSetToGui(data.photoset.id);
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

  getBaseSaveDir: function()
  {
    // get the previous save dir
    var prevSaveDir = null;
    // get the previously used dir from preferences
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                    .getService(Components.interfaces.nsIPrefService);
    prefs = prefs.getBranch("extensions.FlickrGetSet.");
    try
    {
      prevSaveDir = prefs.getComplexValue("saveDir", Components.interfaces.nsILocalFile);
    } catch (e){}

    if (prevSaveDir)
    {
      return prevSaveDir;
    }

    // get the output directory to save the files to
    var nsIFilePicker = Components.interfaces.nsIFilePicker;
    var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, "Save images to...", nsIFilePicker.modeGetFolder);

    if (prevSaveDir)
    {
      fp.displayDirectory = prevSaveDir;
    }
    if (fp.show() != nsIFilePicker.returnOK)
    {
      return null;
    }
    // save the chosen directory
    prefs.setComplexValue("saveDir",
                          Components.interfaces.nsILocalFile, fp.file);
    return fp.file;
  },

  startDownloading: function()
  {
    if (this.isDownloading)
    {
      Application.console.log("Downloading process is already busy");
      return;
    }
    this.isDownloading = true;
    FlickrDownloadManager.downloadNextImage();
  },

  stopDownloading: function()
  {
    Application.console.log("Stop downloading");
    this.isDownloading = false;
  },

  downloadNextImage: function()
  {
    for (var setId in this.setData) {
      Application.console.log("SetId: " + setId);
    }

    if (!this.currentDownloadSet || !this.setData.hasOwnProperty(this.currentDownloadSet))
    {
      // is there a better way to get the first element from the properties list?
      this.currentDownloadSet = null;
      for (var setId in this.setData)
      {
        this.currentDownloadSet = setId;
        break;
      }
      if (!this.currentDownloadSet)
      {
        // no more sets to download
        FlickrDownloadManager.stopDownloading();
        return;
      }

    }
    if (this.setData[this.currentDownloadSet].photoList.length == 0)
    {
      Application.console.log("No more photos to download for set " + this.currentDownloadSet);
      delete this.setData[this.currentDownloadSet];
      this.currentDownloadSet = null;
      FlickrDownloadManager.downloadNextImage();
      return;
    }
    var photoToDownload = this.setData[this.currentDownloadSet].photoList.pop();

    Application.console.log("Download image  " + photoToDownload.name);
    // create the filename
    var origExt = /[a-zA-Z0-9]+$/.exec(photoToDownload.bigUrl)[0];
    Application.console.log("origExt:" + origExt);

    var targetFile = this.setData[this.currentDownloadSet].saveDirectory.clone();
    targetFile.append(photoToDownload.name+"."+origExt);
    if (targetFile.exists())
    {
      Application.console.log("The image already exists. Skip downloading. " + targetFile.path);
      FlickrDownloadManager.downloadNextImage();
      return;
    }
    // create the file
    targetFile.create(targetFile.NORMAL_FILE_TYPE, 0644);

    FlickrDownloadManager.downloadNextImage();
  },

  addSetToGui: function(setId)
  {
    if (!this.downloadDialog || this.downloadDialog.closed)
    {
      // open the download dialog
      this.downloadDialog = window.openDialog("chrome://flickrgetset/content/downloadDialog.xul",
                          "download-set-dialog", "chrome,centerscreen,resizable=yes");
      this.downloadDialog.addEventListener("load", function(e) {FlickrDownloadManager.onDownloadDialogLoad(setId);}, true);
    }
    else
    {
      this.downloadDialog.focus();
      FlickrDownloadManager.onDownloadDialogLoad();
    }
  },

  onDownloadDialogLoad: function(setId)
  {
    var doc = this.downloadDialog.document;
    var setContainer = doc.getElementById("setContainer");
    if (!setContainer)
    {
      alert("Failed to build the dialog because the image container was not present");
      return;
    }

    var setEl = doc.createElement("label");
    setEl.setAttribute("value", this.setData[setId].title);
    setEl.setAttribute("class", "header");
    setContainer.appendChild(setEl);

    var imageContainer = doc.createElement("box");
    imageContainer.setAttribute("align", "start");
    imageContainer.setAttribute("style", "display:block");
    imageContainer.setAttribute("flex", "1");

    for each (var photo in this.setData[setId].photoList)
    {
      var imageBox = doc.createElement("vbox");
      imageBox.setAttribute("align", "center");

      var imageEl = doc.createElement("image");
      imageEl.setAttribute("src", photo.sqUrl);
      imageBox.appendChild(imageEl);

      var imageProgress = doc.createElement("progressmeter");
      imageProgress.setAttribute("mode", "determined");
      imageProgress.setAttribute("style","min-width:75px;");
      imageBox.appendChild(imageProgress);

      imageContainer.appendChild(imageBox);
    }
    setContainer.appendChild(imageContainer);

    // FlickrDownloadManager.startDownloading();
  },

  downloadNextImage_: function()
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

