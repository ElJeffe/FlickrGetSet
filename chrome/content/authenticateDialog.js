var authenticateDialog = {

  openTab: function()
  {
    url = window.arguments[0].url;

    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
      .getService(Components.interfaces.nsIWindowMediator);
    var mainWindow = wm.getMostRecentWindow("navigator:browser");
    var tab = mainWindow.gBrowser.addTab(url);
    mainWindow.gBrowser.selectedTab = tab;
    
  },

  onOk: function()
  {
    Application.console.log("Dialog verif code: " + document.getElementById("verificationCode").value);
    window.arguments[0].out = {verificationCode:document.getElementById("verificationCode").value};
   return true;
  },

  onCancel: function()
  {
    Application.console.log("Cancel clicked");
    window.close();
    return false;
  }
}

authenticateDialog.openTab();

