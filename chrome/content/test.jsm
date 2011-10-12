
var EXPORTED_SYMBOLS = ["getValue", "setValue", "Interface"];

Components.utils.import("resource://gre/modules/Services.jsm");

var Interface =
{
  getValue: getValue, 
}
var value = 0;

function getValue()
{
  Services.console.logStringMessage("Get value");
  return value;
}

function setValue(newVal)
{
  //Services.prompt.alert(null, "error", "Set new value: " + newVal);
  value = newVal;
}
