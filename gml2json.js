const fs = require('fs')

// firstPass();

var definitions = JSON.parse(fs.readFileSync("./proto_output.json", "utf8"));

var proto = readMessageFile("UpdateFigureSuccessMessage");

console.log(JSON.stringify(proto, true, 2));

function readMessageFile(name, namestack={}) {
  var res;
  try {
    if(namestack[name]) {
      return {className: name, error: "RECURSIVE"};
    }
    namestack[name] = true;
    var data = fs.readFileSync("./proto_classes/" + name + ".cs", 'utf8');
    res = parseData(data, name, namestack);
  }
  catch(e) {
    if(e.code == "ENOENT") {
      // console.log("UNREACHABLE", {className: name, values: []})
    }
    else throw e;
  }
  delete namestack[name];
  return res || {className: name, error: "UNREACHABLE"};
}

function parseData(data, name, namestack) {
  var writeToBody = data.match(/public override void WriteTo\(ICodedOutputStream output\)\s+{\s+([\s\S]*?)\s+}\s+\/\//)[1];
  if(!writeToBody) throw "writeToBody is null: " + data.substring(0, 1000);

  var messageTypes = getMessageTypes(writeToBody);
  // console.log(messageTypes)
  var res = {className: name, values: []};

  var defClass = definitions.classes.find((c) => c.className === name);

  for(var i = 0; i < messageTypes.length; i++) {
    var messageType = messageTypes[i];

    switch(messageType.writeFunc) {
      case "WriteInt32":
        res.values.push({ value: 0 });
        break;
      case "WriteInt32Array":
        res.values.push({ value: [] });
        break;
      case "WriteBool":
        res.values.push({ value: false });
        break;
      case "WriteDouble":
        res.values.push({ value: 0 });
        break;
      case "WriteString":
        res.values.push({ value: "" });
        break;
      case "WritePackedEnumArray":
        var innerMessageType = getInnerMessageType(messageType, data);
        res.values.push({ value: [], enumName: innerMessageType });
        break;
      case "WriteEnumArray":
        var innerMessageType = getInnerMessageType(messageType, data);
        res.values.push({ value: [], enumName: innerMessageType });
        break;
      case "WriteEnum":
        var innerMessageType = getInnerMessageType(messageType, data, name);
        res.values.push({ value: 0, enumName: innerMessageType });
        break;
      case "WriteMessage":
      case "WriteMessageArray":
        var innerMessageType = getInnerMessageType(messageType, data);
        res.values.push(readMessageFile(innerMessageType, namestack));
        break;
      default:
        throw "unkown messageType in " + name + ": " + JSON.stringify(messageType);
    }
  }
  for(var j = 0; j < res.values.length; j++) {
    res.values[j].field = defClass.fields[j].name;
    res.values[j].tag = defClass.fields[j].tag;
    res.values[j].type = defClass.fields[j].type;
    res.values[j].typeName = messageTypes[j].writeFunc.replace("Write", "");
    res.values[j].number = defClass.fields[j].number;
  }
  if(typeof res === "undefined") console.log("UNDEFINED")
  return res;
}

function getInnerMessageType(messageType, data, name) {
  // console.log(JSON.stringify(name, messageType))
  if(messageType.writeInnerType) return messageType.writeInnerType;
  var typeVar = messageType.writeParams[2].split(/\./)[1];
  // console.log("inner typeVar: " + typeVar);
  var innerType = data.match(new RegExp("\\w+ ([A-Z][a-zA-Z0-9\\.]*) " + typeVar + "\\b"))[1];
  if(!innerType) throw "innerType is null: " + data.substring(0, 1000);
  return innerType;
}

function getMessageTypes(writeToBody) {
  var re = new RegExp(/output.([A-Z][a-zA-Z0-9]*)(?:<(\w+)>)?\(((?:[^,\n]+,?)+)\)/g);
  var re2 = new RegExp(/(?:([^,\n]+),?)/g);
  var writeFunc = [], writeParams = [], messageTypes = [];
  while (writeFunc = re.exec(writeToBody)) {
    messageTypes.push({ "writeFunc" : writeFunc[1], "writeParams": [] });
    
    if(writeFunc[2]) messageTypes[messageTypes.length - 1].writeInnerType = writeFunc[2];

    while (writeParams = re2.exec(writeFunc[3])) {
      messageTypes[messageTypes.length - 1].writeParams.push(writeParams[1].trim());
    }
  }
  return messageTypes;
}

function firstPass() {
  var arr = [];

  var stop = false;

  fs.readdirSync("./proto_classes").forEach(file => {
    if(!file.endsWith(".cs")) return;
    if(stop) return;

    // stop = true;
    
    fs.readFile("./proto_classes/" + file, 'utf8', (err, data) => {
      if(err) throw err;
      console.log("PARSING", data.substring(0, 400))
      var res = parseData(data);
      if(res === false) {
        console.log("SKIP");
        return;
      }
      arr.push(res);
    });
  });

  setTimeout(function () {
    var out = JSON.stringify({ classes: arr }, null, 2);
    fs.writeFile("./proto_output.json", out, (err) => {
      if(err) throw err;
      console.log("SAVED");
    });
  }, 2000);

  function parseData(data) {
    var className = getClassName(data);
    if(className === false) return false;
    var transformedClassName = "_" + className[0].toLowerCase() + className.substring(1, className.length);
    var fieldNames = getFieldVar(data, transformedClassName + "FieldNames");
    if(fieldNames === false) return false;
    var fieldTags = getFieldVar(data, transformedClassName + "FieldTags");
    var fields = createFields(fieldNames, fieldTags);
    return { className, fields };
  }

  function getClassName(data) {
    var res = data.match(/([A-Z][a-zA-Z0-9]*) : GeneratedMessageLite/);
    return res ? res[1] : false;
  }

  function getFieldVar(data, fieldVar) {
    var re0 = new RegExp(fieldVar + " = new (string|uint)\\[0\\]");
    if(data.match(re0)) return false;
    var re = new RegExp(fieldVar + " = new (string|uint)\\[\\]\\s*{\\s+((.|\\s)*?)\\s+}");
    return data.match(re)[2].replace(/u(,|$)/g, "").replace(/"/g, "").split(/,?\s+/);
  }

  function createFields(names, tags) {
    var res = [];
    for(var i = 0; i < names.length; i++) {
      var tag = parseInt(tags[i]);
      res.push({
        name: names[i],
        tag: tag,
        type: tag & 7,
        typeName: typeNamesEnum(tag & 7),
        number: tag >> 3,
      });
    }
    res.sort((a, b) => a.tag - b.tag);
    return res;
  }

  function typeNamesEnum(id) {
    switch(id) {
      case 0:
        return "varint";
      case 1:
        return "64-bit";
      case 2:
        return "string/message";
      // case 3:
      // case 4:
      //   return "deprecated";
      // case 5:
      //   return "32-bit";
      default:
        return "unk";
    }
  }
}
