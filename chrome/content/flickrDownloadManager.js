Components.utils.import("chrome://flickrgetset/content/flickrOauthWrapper.jsm");


var FlickrDownloadManager; if (FlickrDownloadManager == null) FlickrDownloadManager = 
  {

    init: function() 
    {
      this.setData = {};
      this.isDownloading = false;
      this.currentDownloadSet = null;
      this.downloadDialog = null;
      this.simultaniousDownloads = 4;
      FlickrOAuth.setFlickrUpdateCb(function(s, m, d){FlickrDownloadManager.flickrUpdate(s, m, d)});
      return;
    },

    downloadSet: function(setId, userName)
    {
      this.setId = setId;
      this.userName = userName;
      FlickrOAuth.authenticate(userName, function(status, userName){FlickrDownloadManager.authenticateCb(status, userName)});
    },

    authenticateCb: function(status, userName)
    {
      Application.console.log("Authcallback called: Status: " + status + " user: " + userName);
      return
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

      FlickrOAuth.flickrCallMethod("flickr.photosets.getInfo",{photoset_id:this.setId});
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
      FlickrOAuth.flickrCallMethod("flickr.photosets.getPhotos",{photoset_id:setId, extras:"url_sq,url_z,url_l,url_o"});

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

//  if (prevSaveDir)
//  {
//    return prevSaveDir;
//  }

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

    setPauze: function(pauze)
    {
      if (pauze)
      {
        FlickrDownloadManager.stopDownloading();
      }
      else
      {
        FlickrDownloadManager.startDownloading();
      }
    },

    startDownloading: function()
    {
      if (this.isDownloading)
      {
        Application.console.log("Downloading process is already busy");
        return;
      }
      this.isDownloading = true;
      for (var i = 0; i < this.simultaniousDownloads; ++i)
      {
        FlickrDownloadManager.downloadNextImage();
      }
    },

    stopDownloading: function()
    {
      Application.console.log("Stop downloading");
      this.isDownloading = false;
    },

    downloadNextImage: function()
    {
      // stop downloading if requested
      if (!this.isDownloading)
      {
        return;
      }
      // get a set ID if no valid one is known
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
      var photoToDownload = this.setData[this.currentDownloadSet].photoList.shift();

      // create the filename
      var origExt = /[a-zA-Z0-9]+$/.exec(photoToDownload.bigUrl)[0];
      Application.console.log("origExt:" + origExt);

      var targetFile = this.setData[this.currentDownloadSet].saveDirectory.clone();
      targetFile.append(photoToDownload.name+"."+origExt);
      if (targetFile.exists())
      {
        Application.console.log("The image already exists. Skip downloading. " + targetFile.path);
        photoToDownload.progressBar.setAttribute("max", 1);
        photoToDownload.progressBar.setAttribute("value", 1);

        FlickrDownloadManager.downloadNextImage();
        return;
      }
      // create the file
      targetFile.create(targetFile.NORMAL_FILE_TYPE, 0644);
      // start the download
      var fileDownloader = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);  
      // set listener
      fileDownloader.progressListener = {
        onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
        {
          if (photoToDownload.hasOwnProperty("progressBar"))
          {
            photoToDownload.progressBar.setAttribute("max", aMaxSelfProgress);
            photoToDownload.progressBar.setAttribute("value", aCurSelfProgress);
          }
        },
        onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus)
        {
          if (aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP)
          {
            // This fires when the load finishes
            FlickrDownloadManager.downloadNextImage();
          }
        },
      }

      //save file to target  
      var imageUri = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newURI(photoToDownload.bigUrl, null, null);
      fileDownloader.saveURI(imageUri,null,null,null,null,targetFile); 
    },

    addSetToGui: function(setId)
    {
      if (!this.downloadDialog || this.downloadDialog.closed)
      {
        // open the download dialog
        var params = {pauzeCallback: function(p) {FlickrDownloadManager.setPauze(p)}, openDirCallback: function(id) {FlickrDownloadManager.openDir(id)}, };

        this.downloadDialog = window.openDialog("chrome://flickrgetset/content/downloadDialog.xul",
                                                "download-set-dialog", "chrome,centerscreen,resizable=yes", params);
        this.downloadDialog.addEventListener("load", function(e){FlickrDownloadManager.onDownloadDialogLoad(setId);}, true);
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

        var progressBar = doc.createElement("progressmeter");
        progressBar.setAttribute("mode", "determined");
        progressBar.setAttribute("style","min-width:75px;");
        imageBox.appendChild(progressBar);
        photo.progressBar = progressBar;

        imageContainer.appendChild(imageBox);
      }
      setContainer.appendChild(imageContainer);

//    var openButton = doc.createElement("button");
//    openButton.setAttribute("label", "Open directory");
//    openButton.setAttribute("oncommand", "downloadDialog.onOpenDir(" + setId +");");
//    setContainer.appendChild(openButton);

      FlickrDownloadManager.startDownloading();
    },

    openDir: function(setId)
    {
      Application.console.log("SetId: " + setId);
      this.setData[setId].saveDirectory.reveal();
    },

    exit: function() {
      Application.console.log('Exiting');
      FlickrDownloadManager.stopDownloading();
      window.close();
    },
  }

FlickrDownloadManager.init();

