const fs = require('fs');

var Vars = {
	_strings: ["OrangeNote", "0rangeNote", "EN", "DEFAULT", "EN"],
	_i: 0,
}

var Dummy = {
	Int32: hex(0),
	Bool: hex(0),
	Double: hexDouble(0),
	Enum: hex(1),
	Int32Array: hex([0]),
	EnumArray: hex([1]),
	PackedEnumArray: hex([1]),
	// String: () => {
	// 	return hex(Vars._strings[Vars._i++].split(""))
	// },
	String: () => hex("0".split(""))
}

const className = "UpdateFigureSuccessMessage";

var data = fs.readFileSync("./output/" + className + ".json", "utf8");

var msg = JSON.parse(data);
msg.typeName = "Message";

var res = parseJson(msg);

console.log(res);

function parseJson(obj, level=0, isRoot=true)
{
	if(obj.error === "UNREACHABLE") {
		// console.log("# unreachable class: " + obj.className);
		return pack(hex(obj.tag), hex(0));
	}
	if(obj.error === "RECURSIVE") {
		// console.log("# recursive class: " + obj.className);
		return pack(hex(obj.tag), hex(0));
	}
	
	if(obj.typeName === "Message" || obj.typeName === "MessageArray")
	{
		var par2 = "";
		for (var i = 0; i < obj.values.length; i++)
		{
			var par = parseJson(obj.values[i], level + 1, false);
			par2 += "\n" + Array(level).fill("\t").join("") + par;
		}
		return (isRoot ? par2 : pack(hex(obj.tag), len(par2) + " # " + obj.className, par2)).trim();
	}
	else // primitive type
	{
		var typeName = obj.typeName;
		switch(typeName)
		{
			case "Int32":
			case "Enum":
			case "Bool":
			case "Double":
				return pack(hex(obj.tag), Dummy[typeName]);
			case "Int32Array": // TODO: if tag is 0 varint then it's only one value
			case "EnumArray": // else if tag is 2 message then it's a PACKED (test this by setting dummy list with length > 1) list of values
				return pack(hex(obj.tag + 2), len(Dummy[typeName]), Dummy[typeName]);
			case "PackedEnumArray": // this is a special case of the one above
				return pack(hex(obj.tag), len(Dummy[typeName]), Dummy[typeName]);
			case "String":
				var str = Dummy[typeName]();
				return pack(hex(obj.tag), len(str), str) + ' # "' + Vars._strings[Vars._i - 1] + '"';
			default:
				throw "unknown typeName " + typeName;
		}
	}
}

function hexDouble(num) {
	// wrong implementation
	var double = new Float64Array([num]);
	var byteArr = new Int8Array(double.buffer);
	return Array.from(byteArr).map(byte => hex(Math.abs(byte))).join(" ").toUpperCase();
}

function hex(obj, rec=true) {
	if(Array.isArray(obj)) {
		var res = "";
		for(var i = 0; i < obj.length; i++) {
			obj[i] = typeof obj[i] === "string" ? hex(obj[i].charCodeAt(0), rec) : hex(obj[i], rec);
		}
		return obj.join(" ").toUpperCase();
	}
	else if(obj > 127 && rec) {
		return hex(writeRawVarint32(obj), false);
	}
	else {
		var num = obj.toString(16);
		if (num.length % 2) {
			num = '0' + num;
		}
		return num.toUpperCase();
	}
}

function writeRawVarint32(value)
{
	var position = 0;
	var buffer = [];

	while (value > 127)
	{
		buffer[position++] = (value & 127) | 128;
		value = value >> 7;
	}
	buffer[position++] = value;
	return buffer;
}

function len(x) {
	return hex(x.replace(/ #.+|\s+/g, "").length / 2);
}

function pack(...arr) {
	return (" " + arr.join(" ")).trim();
}
