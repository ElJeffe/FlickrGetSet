/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is code for an authenticate dialig.
 *
 * The Initial Developer of the Original Code is
 * CloudScratcher BVBA.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Jef Steelant <flickrgetset@cloudscratcher.be>
 *
 * ***** END LICENSE BLOCK ***** */

Components.utils.import("resource://gre/modules/Services.jsm");

var authenticateDialog = 
{

  openTab: function()
  {
    var url = window.arguments[0].url;
    this.verifCallback = window.arguments[0].verifCallback;
    this.oAuthData = window.arguments[0].oAuthData;
    var mainWindow = Services.wm.getMostRecentWindow("navigator:browser");
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
          document.getElementById("verificationCode").value = content;
          window.focus();
        }
      }
    }
  },

  onOk: function()
  {
    window.close();
    this.verifCallback(document.getElementById("verificationCode").value, true, this.oAuthData);
  },

  onCancel: function()
  {
    window.close();
    this.verifCallback(null, false, this.oAuthData);
  }
}

authenticateDialog.openTab();

