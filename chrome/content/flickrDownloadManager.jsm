var EXPORTED_SYMBOLS = ["FlickrDownloadManager"];

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://flickrgetset/content/flickrOauthWrapper.jsm");

// this is the interface to the outside
var FlickrDownloadManager =
{
  downloadSet: downloadSet,
  openDir: openDir,
  setPauze: setPauze,
}

var setData = {};
var isDownloading = false;
var currentDownloadSet;
var downloadDialog;
var simultaniousDownloads = 4;


function init() 
{
  log("init");
  FlickrOAuth.setFlickrUpdateCb(function(s, m, d, o){flickrUpdate(s, m, d, o);});
  FlickrOAuth.setAuthenticateCb(function(status, oAuthData){authenticateCb(status, oAuthData);});
}

function downloadSet(setId, userName)
{
  var oAuthData = 
  {
    setId: setId,
    userName: userName
  }
  FlickrOAuth.authenticate(oAuthData);
}

function authenticateCb(status, oAuthData)
{
  if (!status)
  {
    promptWarning("Authentication failed");
    return;
  }

  if (oAuthData.userName)
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
      prefs.setCharPref("defaultUser", oAuthData.userName);
    }
  }

  FlickrOAuth.flickrCallMethod(oAuthData, "flickr.photosets.getInfo",{photoset_id:oAuthData.setId});
}

function flickrUpdate(status, method, data, oAuthData)
{
  log("FlickrUpdate data received for method: " + method);
  if (!status)
  {
    log("Failed to get a result for method " + method + "\n" + data);
    return;
  }

  if (data.stat && data.stat == "fail")
  {
    log("Flickr call failed for: " + method + " Message: " + (data.message?data.message:""));
    return;
  }
  switch (method)
  {
  case "flickr.photosets.getInfo":
    handleSetInfo(data, oAuthData);
    break;
  case "flickr.photosets.getPhotos":
    handleSetPhotos(data, oAuthData);
    break;
  default:
    log("Got a flickr update for an unknown method: " + method);
  }
}

function handleSetInfo(data, oAuthData)
{
  var setId = data.photoset.id;
  var setTitle = data.photoset.title._content;
  if (setData[setId])
  {
    promptWarning("This set is already being downloaded");
    return;
  }
  var baseSaveDir = getBaseSaveDir();
  if (!baseSaveDir)
  {
    log("Choosing saving directory has been canceled");
    return;
  }
  var saveDir = createSaveDir(baseSaveDir, setTitle);
  if (!saveDir)
  {
    log("Failed to create save directory");
    return;
  }
  // save the data
  setData[setId] = {title:setTitle, saveDirectory:saveDir};
  // get the photos for this set
  FlickrOAuth.flickrCallMethod(oAuthData, "flickr.photosets.getPhotos", {photoset_id:setId, extras:"url_sq,url_z,url_l,url_o"});

}

function handleSetPhotos(data, oAuthData)
{
  if (!data.photoset.photo)
  {
    promptWarning("No photos could be retreived for the set");
    delete setData[data.photoset.id];
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
      log("Could not find a big url for " + photoName);
    }
  }
  if (photoList.length == 0)
  {
    promptWarning("No high quality photos could be found for this set");
    delete setData[data.photoset.id];
    return;
  }
  setData[data.photoset.id].photoList = photoList;
  addSetToGui(data.photoset.id);
}

function createSaveDir(baseSaveDir, setName) 
{
  if (!baseSaveDir.isDirectory())
  {
    promptWarning("The chosen directory does not exist! " + saveDir.path);
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
      log("Error message: " + e.message);
      promptWarning("Could not create the directory '" + saveDir.path + "'");
      return null;
    }
  }
  else if (!saveDir.isDirectory())
  {
    for (var i = 1; i < 1000; i++)
    {
      saveDir = baseSaveDir.clone();
      saveDir.append(setTitle +'_' + i);
      if (!saveDir.exists())
      {
        try
        {
          saveDir.create(saveDir.DIRECTORY_TYPE, 0775);
          break;
        } catch (e)
        {
          log("Error message: " + e.message);
          promptWarning("Could not create the directory '" + saveDir.path + "'");
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
}

function getBaseSaveDir()
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

  // get the output directory to save the files to
  var nsIFilePicker = Components.interfaces.nsIFilePicker;
  var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  var window = Services.wm.getMostRecentWindow(null);
  if (!window)
  {
    logError("Failed to find the main window to open filepicker");
    return null;
  }
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
}

function setPauze(pauze)
{
  if (pauze)
  {
    stopDownloading();
  }
  else
  {
    startDownloading();
  }
}

function startDownloading()
{
  if (isDownloading)
  {
    log("Downloading process is already busy");
    return;
  }
  isDownloading = true;
  for (var i = 0; i < simultaniousDownloads; ++i)
  {
    downloadNextImage();
  }
}

function stopDownloading()
{
  log("Stop downloading");
  isDownloading = false;
}

function downloadNextImage()
{
  // stop downloading if requested
  if (!isDownloading)
  {
    return;
  }
  // get a set ID if no valid one is known
  if (!currentDownloadSet || !setData.hasOwnProperty(currentDownloadSet))
  {
    // is there a better way to get the first element from the properties list?
    currentDownloadSet = null;
    for (var setId in setData)
    {
      currentDownloadSet = setId;
      break;
    }
    if (!currentDownloadSet)
    {
      // no more sets to download
      stopDownloading();
      return;
    }
  }
  if (setData[currentDownloadSet].photoList.length == 0)
  {
    log("No more photos to download for set " + currentDownloadSet);
    delete setData[currentDownloadSet];
    currentDownloadSet = null;
    downloadNextImage();
    return;
  }
  var photoToDownload = setData[currentDownloadSet].photoList.shift();

  // create the filename
  var origExt = /[a-zA-Z0-9]+$/.exec(photoToDownload.bigUrl)[0];
  log("origExt:" + origExt);

  var targetFile = setData[currentDownloadSet].saveDirectory.clone();
  targetFile.append(photoToDownload.name+"."+origExt);
  if (targetFile.exists())
  {
    log("The image already exists. Skip downloading. " + targetFile.path);
    photoToDownload.progressBar.setAttribute("max", 1);
    photoToDownload.progressBar.setAttribute("value", 1);

    downloadNextImage();
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
        downloadNextImage();
      }
    }
  }

  //save file to target  
  var imageUri = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newURI(photoToDownload.bigUrl, null, null);
  fileDownloader.saveURI(imageUri,null,null,null,null,targetFile); 
}

function addSetToGui(setId)
{
  log("addSetToGui");
  if (!downloadDialog || downloadDialog.closed)
  {

    var window = Services.wm.getMostRecentWindow(null);
    if (!window)
    {
      logError("Failed to find the main window to open download dialog");
      return;
    }

    // open the download dialog
    downloadDialog = window.openDialog("chrome://flickrgetset/content/downloadDialog.xul",
                                            "download-set-dialog", "chrome,centerscreen,resizable=yes");
    downloadDialog.addEventListener("load", function(e){onDownloadDialogLoad(setId);}, true);
  }
  else
  {
    downloadDialog.focus();
    onDownloadDialogLoad();
  }
}

function onDownloadDialogLoad(setId)
{
  var doc = downloadDialog.document;
  var setContainer = doc.getElementById("setContainer");
  if (!setContainer)
  {
    promptWarning("Failed to build the dialog because the image container was not present");
    return;
  }

  var setEl = doc.createElement("label");
  setEl.setAttribute("value", setData[setId].title);
  setEl.setAttribute("class", "header");
  setContainer.appendChild(setEl);

  var imageContainer = doc.createElement("box");
  imageContainer.setAttribute("align", "start");
  imageContainer.setAttribute("style", "display:block");
  imageContainer.setAttribute("flex", "1");

  for each (var photo in setData[setId].photoList)
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

  var openButton = doc.createElement("button");
  openButton.setAttribute("label", "Open directory");
  openButton.setAttribute("oncommand", "onOpenDir(" + setId +");");
  setContainer.appendChild(openButton);

  startDownloading();
}

function openDir(setId)
{
  log("SetId: " + setId);
  log("set: " + setData);
  log("set len: " + setData.length);
  setData[setId].saveDirectory.reveal();
}

function exit() {
  log('Exiting');
  stopDownloading();
  window.close();
}

function log(msg)
{
  Services.console.logStringMessage(msg);
}

function logError(msg)
{
  Services.console.logStringMessage("ERROR: " + msg);
}

function promptWarning(msg)
{
  Services.prompt.alert(null, "FlickrGetSet warning", msg);
}


init();
