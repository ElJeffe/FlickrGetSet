var authenticateDialog = 
{

  openTab: function()
  {
    url = window.arguments[0].url;
    this.verifCallback = window.arguments[0].verifCallback;

    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
    .getService(Components.interfaces.nsIWindowMediator);
    var mainWindow = wm.getMostRecentWindow("navigator:browser");
    this.tab = mainWindow.gBrowser.addTab(url);
    mainWindow.gBrowser.selectedTab = this.tab;
  },

  onOk: function()
  {
    Application.console.log("Dialog verif code: " + document.getElementById("verificationCode").value);
    window.close();
    this.verifCallback(document.getElementById("verificationCode").value, true);
  },

  onCancel: function()
  {
    Application.console.log("Cancel clicked");
    window.close();
    this.verifCallback(null, false);
  }
}

authenticateDialog.openTab();

