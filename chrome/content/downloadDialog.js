Components.utils.import("chrome://flickrgetset/content/flickrDownloadManager.jsm");


var downloadDialog = 
{
  onCancel: function()
  {
    Application.console.log("Cancel clicked");
    window.close();
    FlickrDownloadManager.setPauze(true);
  },

  onOpenDir: function(setId)
  {
    FlickrDownloadManager.openDir(setId);
  },

  onOpenPhoto: function(photoId)
  {
    FlickrDownloadManager.openPhoto(photoId);
  },
}
