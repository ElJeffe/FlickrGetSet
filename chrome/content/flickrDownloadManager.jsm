var EXPORTED_SYMBOLS = ["FlickrDownloadManager"];

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://flickrgetset/content/flickrOauthWrapper.jsm");

// this is the interface to the outside
var FlickrDownloadManager =
{
  downloadSet: downloadSet,
  openDir: openDir,
  openPhoto: openPhoto,
  setPauze: setPauze,
}

// global variables
var setData = {};
var downloadedPhotos = {};
var isDownloading = false;
var currentDownloadSet;
var downloadDialog;
var simultaniousDownloads = 4;


/**
 * Initialize 
 *  
 * Callback functions for the FlickrOAUth wrapper are set here 
 * 
 * @author jef (10/13/2011)
 */
function init() 
{
  FlickrOAuth.setFlickrUpdateCb(function(s, m, d, o){flickrUpdate(s, m, d, o);});
  FlickrOAuth.setAuthenticateCb(function(status, oAuthData){authenticateCb(status, oAuthData);});
};

/**
 * Trigger the download of a set
 * 
 * @author jef (10/14/2011)
 * 
 * @param setId The set toe be downloaded
 * @param userName The user that is currently logged in in Flickr
 */
function downloadSet(setId, userName)
{
  // this object will contain all data needed to sign calls
  var oAuthData = 
  {
    // these are the API keys of FlickrGetSet for flickr
    consumerKey: "fb83db48de20585d51c21052562dc3ae",
    consumerSecret: "4cafb2345ff39878",
    // specific info
    setId: setId,
    userName: userName
  }
  FlickrOAuth.authenticate(oAuthData);
};

/**
 * The authentication is finished
 * 
 * @author jef (10/14/2011)
 * 
 * @param status True if authentication succeeded
 * @param oAuthData OAuth signing data
 */
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
};

/**
 * This callback will be called when a Flickr call has finished
 * 
 * @author jef (10/14/2011)
 * 
 * @param status True if successful
 * @param method The method that was called
 * @param data The data that is returned by Flickr
 * @param oAuthData OAuth signing data
 */
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
};

/**
 * Handle a flickr set info call 
 *  
 * A directory will be asked and created 
 * The photo information will be asked at Flickr 
 * 
 * @author jef (10/14/2011)
 * 
 * @param data The set info data (in JSON format)
 * @param oAuthData OAuth signing data
 */
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

};

/** Handle a flickr set photos call
 *  
 *  Parse all retrieved data and initialize the GUI
 * 
 * @author jef (10/14/2011)
 * 
 * @param data The set photos data (in JSON format)
 * @param oAuthData OAuth signing data
 */
function handleSetPhotos(data, oAuthData)
{
  if (!data.photoset.photo)
  {
    promptWarning("No photos could be retrieved for the set");
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
    photoData.id = photo.id;
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
};

/**
 * Create a save directory 
 *  
 * Try to create a subdirectory with the set name in the given base directory 
 * 
 * @author jef (10/14/2011)
 * 
 * @param baseSaveDir The dir where to create the new dir
 * @param setName The name of the new subdir to be created in baseSaveDir
 */
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
};

/**
 * Ask the dir to save in at the user. 
 *  
 * It will be initialized with the last used save dir 
 * 
 * @author jef (10/14/2011)
 */
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
};

/**
 * Pause or unpauze downloading
 * 
 * @author jef (10/14/2011)
 * 
 * @param pauze Pauze if this is true
 */
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
};

/**
 * Start downloading the photos
 * 
 * @author jef (10/14/2011)
 */
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
};

/**
 * Stop downloading
 * 
 * @author jef (10/14/2011)
 */
function stopDownloading()
{
  log("Stop downloading");
  isDownloading = false;
};

/**
 * Download the next image that should be downloaded
 * 
 * @author jef (10/14/2011)
 */
function downloadNextImage()
{
  // stop downloading if requested
  if (!isDownloading)
  {
    return;
  }
  // get a set ID if no valid one is known
  if (!currentDownloadSet || 
      !setData.hasOwnProperty(currentDownloadSet) || 
      setData[currentDownloadSet].photoList.length == 0)
  {
    currentDownloadSet = null;
    for (var setId in setData)
    {
      if (setData[setId].photoList.length > 0)
      {
        currentDownloadSet = setId;
        break;
      }
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
    currentDownloadSet = null;
    downloadNextImage();
    return;
  }
  var photoToDownload = setData[currentDownloadSet].photoList.shift();

  // create the filename
  var origExt = /[a-zA-Z0-9]+$/.exec(photoToDownload.bigUrl)[0];

  var targetFile = setData[currentDownloadSet].saveDirectory.clone();
  targetFile.append(photoToDownload.name+"."+origExt);
  photoToDownload.file = targetFile;
  if (targetFile.exists())
  {
    log("The image already exists. Skip downloading. " + targetFile.path);
    photoToDownload.progressBar.setAttribute("max", 1);
    photoToDownload.progressBar.setAttribute("value", 1);
    downloadedPhotos[photoToDownload.id] = photoToDownload;
    downloadNextImage();
    return;
  }
  log("Downloading " + targetFile.path);

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
        downloadedPhotos[photoToDownload.id] = photoToDownload;
        downloadNextImage();
      }
    }
  }

  //save file to target  
  var imageUri = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newURI(photoToDownload.bigUrl, null, null);
  fileDownloader.saveURI(imageUri,null,null,null,null,targetFile); 
};

/**
 * Add a new set to the GUI 
 *  
 * A download dialog will be created if none exists yet. 
 * The actual adding to the UI will happen in the onDownloadDialogLoad callback, 
 * because the dialog should first be constructed 
 * 
 * @author jef (10/14/2011)
 * 
 * @param setId The set to be added to the GUI
 */
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
    onDownloadDialogLoad(setId);
  }
};

/**
 * Add a new set to the GUI
 * 
 * @author jef (10/14/2011)
 * 
 * @param setId The set to be added
 */
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
    imageEl.setAttribute("ondblclick", "downloadDialog.onOpenPhoto('" + photo.id + "');");
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
  openButton.setAttribute("oncommand", "downloadDialog.onOpenDir('" + setId +"');");
  setContainer.appendChild(openButton);

  startDownloading();
};

/**
 * Try to open a directory (triggered by the downloadDialog) 
 *  
 * Note that this does not work on all platforms! 
 * 
 * @author jef (10/14/2011)
 * 
 * @param setId The set to be opened
 */
function openDir(setId)
{
  setData[setId].saveDirectory.QueryInterface(Components.interfaces.nsILocalFile);
  try
  {
    setData[setId].saveDirectory.reveal();
  } catch (e)
  {
    Services.prompt.alert(null, "Not supported", "Opening a directory is not supported on this platform");
  }
};

/**
 * Try to open a photo on the local OS (triggered by the downloadDialog) 
 *  
 * Note that this does not work on all platforms! 
 * 
 * @author jef (10/14/2011)
 * 
 * @param photoId The photo to be opened
 */
function openPhoto(photoId)
{
  if (!downloadedPhotos.hasOwnProperty(photoId))
  {
    // the photo has not finished downloading yet
    return;
  }
  try
  {
    downloadedPhotos[photoId].file.QueryInterface(Components.interfaces.nsILocalFile);
    downloadedPhotos[photoId].file.launch();
  } catch (e)
  {
    logError("Failed to lauch file for " + downloadedPhotos[photoId].name);
  }
};

/**
 * Exit 
 *  
 * Stop downloading and perform cleanup 
 * 
 * @author jef (10/14/2011)
 */
function exit() {
  stopDownloading();
  setData = {};
  downloadedPhotos = {};
  window.close();
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
  Services.prompt.alert(null, "FlickrGetSet warning", msg);
};

// initialize on first load
init();
