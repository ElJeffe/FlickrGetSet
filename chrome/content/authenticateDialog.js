var authenticateDialog = 
{

  openTab: function()
  {
    url = window.arguments[0].url;
    this.verifCallback = window.arguments[0].verifCallback;

    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
    .getService(Components.interfaces.nsIWindowMediator);
    var mainWindow = wm.getMostRecentWindow("navigator:browser");
    var tab = mainWindow.gBrowser.addTab(url);
    mainWindow.gBrowser.selectedTab = tab;
    tab.addEventListener("load", authenticateDialog.onPageLoad, true);
  },

  onPageLoad: function(event)
  {
//  var doc = event.originalTarget;
//  var mainElement = doc.getElementById("Main");
//  if (mainElement)
//  {
//    Application.console.log("Main element found: " + mainElement.innerHTML);
//  }
  },

  onOk: function()
  {
    Application.console.log("Dialog verif code: " + document.getElementById("verificationCode").value);
    this.verifCallback(document.getElementById("verificationCode").value, true);
    window.close();
  },

  onCancel: function()
  {
    Application.console.log("Cancel clicked");
    this.verifCallback(null, false);
    window.close();
  }
}

authenticateDialog.openTab();

