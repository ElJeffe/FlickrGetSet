var downloadDialog; if (downloadDialog == null) downloadDialog = 
  {
  init: function()
  {
    Application.console.log("init");
    this.pauzeCallback = window.arguments[0].pauzeCallback;
    this.openDirCallback = window.arguments[0].openDirCallback;
    Application.console.log("Cb: " + this.pauzeCallback);
  },

  onCancel: function()
  {
    Application.console.log("Cancel clicked");
    window.close();
    this.pauzeCallback(true);
  },

  onOpenDir: function(setId)
  {
    this.openDirCallback(setId);
  }
}

downloadDialog.init();


