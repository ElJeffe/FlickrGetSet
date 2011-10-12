
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
      var Test = {};
      Components.utils.import("chrome://flickrgetset/content/test.jsm", Test);
      Application.console.log("value: " + Test.getValue());
      Test.setValue(Test.getValue() + 1);
      Application.console.log("value: " + Test.getValue());
      if (/.*www\.steelant\.be.*/.test(doc.location.href))
      {

        FlickrDownloadManager.downloadSet("72157627601593559", "ElJeffe");
      }
      return;
    }
    Application.console.log("Flickr set loaded");
    var elements = doc.getElementsByClassName("share-this-wrapper");

    if (elements.length > 0)
    {
      var list = elements[0].firstElementChild;
      
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
  },
  
  onDownloadSet: function(aEvent, doc) {
    var userName = flickrHook.getUserName(doc);
    // get setId
    var res = /.*flickr\.com\/.*\/sets\/(\d+).*/.exec(doc.location.href);
    var setId = res[1];
    if (!setId)
    {
      alert("Dailed to detirmine the Set ID from the url");
      return;
    }
    Application.console.log("setid: " + setId + " User name: " + userName);
    FlickrDownloadManager.downloadSet(setId, userName);
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

  getUserName: function(doc)
  {
    var headStatus = doc.getElementById("head-status");
    if (!headStatus)
    {
      return null;
    }
    var aElements = headStatus.getElementsByTagName("a");
    for (var i = 0; i < aElements.length; ++i)
    {
      if (aElements[i].hasAttribute("data-track") && 
          (aElements[i].getAttribute("data-track") == "account"))
      {
        return aElements[i].textContent.trim();
      }
    }
  }
}  
