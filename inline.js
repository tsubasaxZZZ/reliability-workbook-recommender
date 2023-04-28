const fs = require("fs")
const inline = require("web-resource-inliner")

inline.html(
  {
    fileContent: readFileSync("./dist/index.html"),
    relativeTo: "./dist",
  },
  (err, result) => {
    if (err) { throw err }
    fs.writeFileSync("./dist/index.html", result)
  }
)


function readFileSync(file) {
  const contents = fs.readFileSync(file, "utf8")
}
