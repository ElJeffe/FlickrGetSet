Components.utils.import("chrome://flickrgetset/content/flickrDownloadManager.jsm");


function onCancel()
{
  Application.console.log("Cancel clicked");
  window.close();
  FlickrDownloadManager.setPauze(true);
}

function onOpenDir(setId)
{
  Application.console.log("onOpenDir " + setId);
  FlickrDownloadManager.openDir(setId);
}


