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
    this.tab.addEventListener("load", function(e) {authenticateDialog.onPageLoad();}, true);
  },

  onPageLoad: function()
  {
    var doc = this.tab.document;
    var mainElement = doc.getElementById("Main");
    if (mainElement)
    {
      Application.console.log("Main element found: " + mainElement.innerHTML);
    }
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

