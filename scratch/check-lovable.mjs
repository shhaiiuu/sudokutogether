const res = await fetch("http://localhost:8080/");
const text = await res.text();
console.log("Contains lovable:", text.toLowerCase().includes("lovable"));
const matches = text.match(/lovable[^\s"']*/gi);
console.log("Matches:", matches);
