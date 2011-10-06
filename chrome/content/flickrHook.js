
window.addEventListener("load", function(){ flickrHook.init();}, false);  

var flickrHook = {  
  init: function() {  
    var appcontent = document.getElementById("appcontent");   // browser  
    if (appcontent)
      appcontent.addEventListener("DOMContentLoaded", flickrHook.onPageLoad, true);
    this.counter = 0;
  },  
  
  onPageLoad: function(aEvent) {  
    var doc = aEvent.originalTarget; // doc is document that triggered "onload" event  
    if (!/.*flickr\.com\/.*\/sets\/\d+.*/.test(doc.location.href))
    {

      if (/.*www\.steelant\.be.*/.test(doc.location.href))
      {
        FlickrDownloadManager.downloadSet("72157627601593559", "ElJeffe");
//    window.openDialog("chrome://flickrgetset/content/downloadDialog.xul",
//                        "download-set-dialog-"+this.counter, "chrome,centerscreen", "test", "test", new Array());
      }
      return;
    }
    Application.console.log("Flickr set loaded");
    elements = doc.getElementsByClassName("share-this-wrapper");

    if (elements.length > 0)
    {
      list = elements[0].firstElementChild;
      
      var listItem = document.createElement("li");
      listItem.setAttribute("style", "margin-right: 0.5em;");
      var button = doc.createElement("span");
      button.setAttribute("class", "Butt");
      button.appendChild(doc.createTextNode("Download Set"));
      button.addEventListener("click", function(event) { flickrHook.onDownloadSet(event, doc); }, true);
      
      //var listItemText = document.createTextNode("Download Set");
      listItem.appendChild(button);
      
      list.insertBefore(listItem, list.firstElementChild);
    }

    // add event listener for page unload   
    aEvent.originalTarget.defaultView.addEventListener("unload", function(event){ flickrHook.onPageUnload(event);}, true);  
  },
  
  onDownloadSet: function(aEvent, doc) {

    var setTitle = flickrHook.getSetTitle(doc);
    var photoIds = flickrHook.getPhotoIds(doc);

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
      return;
    }
    // save the chosen directory
    prefs.setComplexValue("saveDir",
                          Components.interfaces.nsILocalFile, fp.file);

    // open the download dialog
    window.openDialog("chrome://flickrgetset/content/downloadDialog.xul",  
                        "download-set-dialog-"+this.counter, "chrome,centerscreen", fp.file, setTitle, photoIds);
    this.counter++;
  },

  getPhotoIds: function(doc) {
    var photoIds = new Array();
    var thumbs = doc.getElementById("setThumbs");
    if (!thumbs)
    {
      return photoIds;
    }
    var photos = thumbs.getElementsByClassName("photo-display-item");
    for (var i=0; i<photos.length; i++)
    {
      if (photos[i].hasAttribute("data-photo-id"))
      {
        var id = photos[i].getAttribute("data-photo-id");
        photoIds.push(id);
      }
    }
    return photoIds;
  },

  getSetTitle: function(doc) {
    var titleElements = doc.getElementsByClassName("set-title");
    if (titleElements.length == 0)
    {
      return "";
    }
    return titleElements[0].textContent.trim();
  },
  
  onPageUnload: function(aEvent) {  
    // do something  
  }  
}  
