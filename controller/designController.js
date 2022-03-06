const express = require("express");
const Design = require("../model/Design");
const User = require("../model/User");
const router = express.Router();
const multer = require("multer");

const uploadFile = require("../utils/s3");
const checkIsMyProject = require("../utils/checkIsMyProject");
const checkPendingCollabRequest = require("../utils/checkCollabRequest");

const upload = multer({ dest: "public/" });

// create a new design document starting from the name property
router.post("/create", async (req, res) => {
  try {
    const newDoc = new Design({
      name: req.body.name,
      creator: req.session.user._id,
      image: "https://joybee.s3.amazonaws.com/37ca0cc0f10936bd31bd2ec38ae31e25",
      collaborators: [],
      collabRequestUsers: [],
      characters: [],
      locations: [],
      items: [],
      gameplay: [],
      genre: "ADVENTURE",
      deleted: false,
    });
    await newDoc.save();

    const newDocId = newDoc._id;
    await User.findByIdAndUpdate(req.session.user._id, {
      $push: { designs: newDocId },
    });
    res.json(newDoc);
  } catch (err) {
    res.json({ error: err });
  }
});

// edit document
router.put("/edit/:editid", async (req, res) => {
  try {
    const { editid } = req.params;
    const { update } = req.body;
    const originalDoc = await Design.findById(editid);
    const myProject = checkIsMyProject(req.session.user, originalDoc);
    if (!myProject) {
      res.json({ error: "user does not have access to edit this project" });
      return;
    }
    const updatedDoc = await Design.findByIdAndUpdate(editid, update, {
      new: true,
    });
    res.json(updatedDoc);
  } catch (err) {
    res.json({ error: err });
  }
});

// edit document main images
router.put("/edit/image/:editid", upload.single("image"), async (req, res) => {
  try {
    const { editid } = req.params;
    const originalDoc = await Design.findById(editid);
    const myProject = checkIsMyProject(req.session.user, originalDoc);
    if (!myProject) {
      res.json({ error: "user does not have access to edit this project" });
      return;
    }

    const file = req.file;

    // if image file present, upload to s3 and overwrite the default img
    if (file) {
      console.log(file.mimetype);
      const allowedImgTypes = ["image/jpeg", "image/png"];
      if (allowedImgTypes.includes(file.mimetype)) {
        console.log("file type allowed");
        const result = await uploadFile(file);
        img = result.Location;
        const updatedDoc = await Design.findByIdAndUpdate(
          editid,
          { image: img },
          {
            new: true,
          }
        );
        res.json(updatedDoc);
      }
    } else {
      res.json({ error: "no image found" });
    }
  } catch (err) {
    res.json({ error: err });
  }
});

// add image to s3 and return url
// used when batching an update for cards, locations, etc. in arrays
router.put("/image-upload", upload.single("image"), async (req, res) => {
  const file = req.file;
  // if image file present, upload to s3 and overwrite the default img
  if (file) {
    console.log(file.mimetype);
    const allowedImgTypes = ["image/jpeg", "image/png"];
    if (allowedImgTypes.includes(file.mimetype)) {
      console.log("file type allowed");
      const result = await uploadFile(file);
      img = result.Location;
      res.json({ image: img });
    } else {
      res.json({ error: "only jpeg / png allowed" });
    }
  } else {
    res.json({ error: "no image found" });
  }
});

// move document to trash
router.put("/trash/:designid", async (req, res) => {
  try {
    const { designid } = req.params;
    const originalDoc = await Design.findById(designid);
    const myProject = checkIsMyProject(req.session.user, originalDoc);
    if (!myProject) {
      res.json({ error: "user does not have access to edit this project" });
      return;
    }
    const updatedDoc = await Design.findByIdAndUpdate(designid, {
      deleted: true,
    });
    res.json(updatedDoc);
  } catch (err) {
    res.json({ error: err });
  }
});

// permadelete document
router.delete("/delete/:designid", async (req, res) => {
  try {
    const { designid } = req.params;
    const originalDoc = await Design.findById(designid);
    const myProject = checkIsMyProject(req.session.user, originalDoc);
    if (!myProject) {
      res.json({ error: "user does not have access to edit this project" });
      return;
    }
    await Design.findByIdAndDelete(designid);
    // remove from collaborators as well
    // remove from user
    res.json({ deleted: true });
  } catch (err) {
    res.json({ error: err });
  }
});

// request to join project
router.post("/join", async (req, res) => {
  try {
    // add user id to collab request users on design object
    const updatedDoc = await Design.findByIdAndUpdate(req.body.designId, {
      $push: { collabRequestUsers: req.session.user._id },
    });

    // add design id to collab requests on the design owner's object
    await User.findByIdAndUpdate(updatedDoc.creator, {
      $push: { collabRequests: req.body.designId },
    });

    // return updated doc
    res.json({
      designDoc: updatedDoc,
      myProject: false,
      pendingCollabRequest: true,
    });
  } catch (err) {
    res.json({ error: err });
  }
});

// remove self from project/ rescind request

// add user as collaborator

// remove user as collaborator

// get individual document
router.get("/:designid", async (req, res) => {
  try {
    const designDoc = await Design.findById(req.params.designid);
    const myProject = checkIsMyProject(req.session.user, designDoc);
    const pendingCollabRequest = checkPendingCollabRequest(
      req.session.user,
      designDoc
    );
    res.json({
      designDoc,
      myProject,
      pendingCollabRequest,
    });
  } catch (err) {
    res.json({ error: err });
  }
});

// get user docs
router.get("/user", async (req, res) => {
  try {
    // get the ids for your own designs and collaborations
    if (!req.session.user) {
      res.json({ error: "unauthenticated" });
      return;
    }
    const docs = await Design.find({
      _id: { $in: [...req.session.user.designs, ...req.session.user.collabs] },
    });
    res.json(docs);
  } catch (err) {
    res.json({ error: err });
  }
});

// search for specific documents
router.post("/search", async (req, res) => {
  console.log(req.body);
  try {
    let searchParams = req.body.searchParams;
    if (searchParams.username) {
      const creators = await User.find({
        username: req.body.searchParams.username,
      });

      const creatorIds = creators.map((c) => c._id);
      searchParams.creator = { $in: creatorIds };
    }

    const docs = await Design.find(searchParams);
    console.log(docs);
    res.json(docs);
  } catch (err) {
    res.json({ error: err });
  }
});

// get all specified documents
router.get("/", async (req, res) => {
  try {
    const docs = await Design.find({ _id: { $in: req.body.designIds } });
    res.json(docs);
  } catch (err) {
    res.json({ error: err });
  }
});

module.exports = router;
