var authenticateDialog = 
{

  openTab: function()
  {
    var url = window.arguments[0].url;
    this.verifCallback = window.arguments[0].verifCallback;
    this.oAuthData = window.arguments[0].oAuthData;

    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
    .getService(Components.interfaces.nsIWindowMediator);
    var mainWindow = wm.getMostRecentWindow("navigator:browser");
    var tab = mainWindow.gBrowser.addTab(url);
    mainWindow.gBrowser.selectedTab = tab;
    var tabBrowser = mainWindow.gBrowser.getBrowserForTab(tab);
    tabBrowser.addEventListener("load", function() {authenticateDialog.onPageLoad(tabBrowser.contentDocument);}, true);
  },

  /**
   * Check if a verification ocde is present on the loaded page. If so, fill it in, 
   * and give focus to the dialog 
   * 
   * @author jef (10/17/2011)
   * 
   * @param doc 
   */
  onPageLoad: function(doc)
  {
    var mainElement = doc.getElementById("Main");
    if (mainElement)
    {
      var spanList = mainElement.getElementsByTagName("span");
      for (var i = 0; i < spanList.length; ++i)
      {
        var content = spanList[i].textContent.trim();
        if (/\d\d\d-\d\d\d-\d\d\d/.exec(content))
        {
          Application.console.log("Found verification code: " + content);
          document.getElementById("verificationCode").value = content;
          window.focus();
        }
      }
    }
  },

  onOk: function()
  {
    Application.console.log("Dialog verif code: " + document.getElementById("verificationCode").value);
    window.close();
    this.verifCallback(document.getElementById("verificationCode").value, true, this.oAuthData);
  },

  onCancel: function()
  {
    Application.console.log("Cancel clicked");
    window.close();
    this.verifCallback(null, false, this.oAuthData);
  }
}

authenticateDialog.openTab();

