var downloadDialog; if (downloadDialog == null) downloadDialog = 
  {
  init: function()
  {
    Application.console.log("init downloadDialog");
//  var Test = {};
//  Components.utils.import("chrome://flickrgetset/content/test.jsm", Test);
//  Application.console.log("dd value: " + Test.getValue());
//  Test.setValue(Test.getValue() + 1);
//  Application.console.log("dd value: " + Test.getValue());

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


