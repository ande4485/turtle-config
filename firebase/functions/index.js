const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {v4: uuidv4} = require("uuid");
admin.initializeApp();
const db = admin.firestore();

exports.createDeviceAndBox = functions.https.onCall(async (data, context) =>{
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called while authenticated");
  }

  const uidUser = context.auth.uid;
  const user = await db.collection("users").doc(uidUser).get();
  if (user.exists) {
  // normally user doesn't exist
    const nameDevice = data.nameDevice;
    const userNameForDevice = data.userNameForDevice;
    const lastNameOwner = data.lastNameOwner;
    const nameOwner = data.nameOwner;
    // so create auth for box
    const uuidBox = uuidv4();
    const pswdBox = uuidv4();
    const emailBox = uuidBox + "@device.com";
    const userRecord = await admin.auth().createUser({
      customClaims: {
        isDevice: true,
      },
      email: emailBox,
      emailVerified: true,
      password: pswdBox,
      disabled: false,
    });
    const uidBox = userRecord.uid;
    // now create device
    const device = getDevice(lastNameOwner, nameOwner, uidUser,
        userNameForDevice, nameDevice, uidBox);
    const deviceFirestore = await db.collection("devices")
        .add(device);

    // now create user

    // update
    await db.collection("users").doc(uidUser)
        .update({devices: admin.firestore.FieldValue
            .arrayUnion({id: deviceFirestore.id, name: nameDevice, role: 0})});

    // so it's good
    return {
      idDevice: uuidv4(),
      idFirebase: deviceFirestore.id,
      email: emailBox,
      pswd: pswdBox,

    };
  }
});


/**
 * @param {*} lastNameOwner
 * @param {*} nameOwner
 * @param {*} uidUser
 * @param {*} userNameForDevice
 * @param {*} nameDevice
 * @param {*} uidBox
 * @return {*} device object
 */
function getDevice(lastNameOwner, nameOwner, uidUser, userNameForDevice,
    nameDevice, uidBox) {
  // we return always a device because there' no other device
  return {
    type: 1,
    name: nameDevice,
    admin: uidUser,
    showInfo: true,
    fontSize: 20,
    idBox: uidBox,
    lastNameOwner: lastNameOwner,
    nameOwner: nameOwner,
    users: [{id: uidUser, name: userNameForDevice}],
    usersAllowed: [uidUser],
    usersInvited: [],
    usersWaiting: [],
    pFe: [],
    messBeforeEnd: "",
    bNight: true};
}

/**
 * @param {*} devices
 * @param {*} id
 * @return {*} true or false
 */
function deviceExist(devices, id) {
  const findDevice = devices.findIndex((device) => device.id === id);
  if (findDevice === -1) {
    return false;
  } else {
    return true;
  }
}

exports.createDevice = functions.https.onCall(async (data, context) =>{
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called while authenticated");
  }
  const uidUser = context.auth.uid;
  const user = await db.collection("users").doc(uidUser).get();
  if (user.exists) {
    const nameDevice = data.nameDevice;
    const userNameForDevice = data.userNameForDevice;
    const lastNameOwner = data.lastNameOwner;
    const nameOwner = data.nameOwner;

    const uidBox = data.idBox;
    // so create auth for box
    // now create device

    const device = getDevice(lastNameOwner, nameOwner, uidUser,
        userNameForDevice, nameDevice, uidBox);
    const deviceFirestore = await db.collection("devices")
        .add(device);
    // now create user
    // update
    await db.collection("users").doc(uidUser)
        .update({devices: admin.firestore.FieldValue
            .arrayUnion({id: deviceFirestore.id, name: nameDevice, role: 0})});
    const messageWelcomeLang = "Welcome";
    const messWelcome = {
      from: "44444444444",
      fStr: "Connected-turtle",
      to: uidUser,
      d: admin.firestore.Timestamp.fromDate(Date.now()),
      m: messageWelcomeLang,
      t: 0,
      nva: false,
      r: true};
    await db.collection("devices")
        .doc(deviceFirestore.id).collection("messages").add(messWelcome);
    // so it's good
    return {
      idDevice: uuidv4(),
      idFirebase: deviceFirestore.id,

    };
  }
});


exports.deleteDevice = functions.https.onCall(async (data, context) =>{
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called while authenticated");
  }
  const idAdmin = context.auth.uid;
  const idDevice = data.idDevice;
  const adminUser = await db.collection("users")
      .doc(idAdmin).get();
  if (adminUser.exists) {
    if (deviceExist(adminUser.data().devices, idDevice)) {
      const device = await db.collection("devices")
          .doc(idDevice).get();
      const users = device.data().users;
      const usersInvited = device.data().usersInvited;
      const usersWaiting = device.data().usersWaiting;
      // delete device for all users
      const usersToDelete = [...users, ...usersInvited,
        ...usersWaiting];
      usersToDelete.forEach(async (user)=>{
        try {
          await db.runTransaction(async (t) => {
            const userRef = db.collection("users")
                .doc(user.id);
            const doc = await t.get(userRef);
            if (doc != undefined) {
              const device = doc.data().devices
                  .find((device) => device.id === idDevice);
              if (device != undefined) {
                t.update(userRef, {devices: admin.firestore.FieldValue
                    .arrayRemove(device)});
              }
            }
          });
        } catch (e) {
          return {result: "ERROR"};
        }
      });

      // delete device in firestore
      await db.collection("devices")
          .doc(idDevice).delete();
      const storage = admin.storage();
      storage.bucket(idDevice).delete();
      return {result: "OK"};
    } else return {result: "error"};
  } else {
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "if you are admin");
  }
});


/**
 * if user doesn't exist so we go here
 */
exports.createInvitUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "while authenticated.");
  }
  const emailUserToAdd = data.emailUserToAdd;
  // request for adding person must be the root id
  const idAdmin = context.auth.uid;
  const idDevice = data.idDevice;
  const nameDevice = data.nameDevice;
  // check if actual user is admin device
  const adminUser = await db.collection("users")
      .doc(idAdmin).get();
  if (adminUser.exists && deviceExist(adminUser.data().devices, idDevice)) {
    // so get device datas
    const userSearchToAdd = await db.collection("users")
        .where("email", "==", emailUserToAdd).limit(1).get();
    if (userSearchToAdd.empty) {
      return {
        result: "USER_NOT_FOUND"};
    } else {
      console.log("devices");
      console.log(userSearchToAdd.docs[0].data().devices);
      if (typeof userSearchToAdd.docs[0].data().devices === "undefined" ||
            !deviceExist(userSearchToAdd.docs[0].data().devices, idDevice)) {
        await db.collection("users")
            .doc(userSearchToAdd.docs[0].id)
            .update({
              devices: admin.firestore.FieldValue
                  .arrayUnion({
                    "id": idDevice,
                    "name": nameDevice,
                    "role": 3,
                    "by": adminUser.data().lastName +
                                " " + adminUser.data().name})});
        await db.collection("devices").doc(idDevice)
            .update({
              usersInvited: admin.firestore.FieldValue
                  .arrayUnion({"id": userSearchToAdd.docs[0].id,
                    "email": emailUserToAdd})});
      } else return {result: "ALREADY_EXIST"};
    }
    return {result: "OK"};
  } else {
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "if you are admin");
  }
});

/**
 * accepts user if user exist and admin chek data

 */
exports.acceptUserForDevice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "while authenticated.");
  }
  const idUser = data.idUser;
  const idDevice = data.idDevice;
  // request for adding person must be the root id
  const idAdmin = context.auth.uid;
  // check if actual user is admin device
  const adminUser = await db
      .collection("users").doc(idAdmin).get();
  if (adminUser.exists) {
    const indexDevice = adminUser.data().devices
        .findIndex((device)=> device.id === idDevice);
    if (indexDevice != -1 && adminUser.data().devices[indexDevice].role == 0) {
    // so get device datas
      const user = await db.collection("users").doc(idUser).get();
      const newDevices = user.data().devices;
      const nameForDevice = user.data().nameForDevice;
      const indexDeviceNewUser = newDevices
          .findIndex((device)=> device.id === idDevice);
      newDevices[indexDeviceNewUser].role = 1;
      // update user
      await db.collection("users")
          .doc(idUser).update({devices: newDevices});
      // get device
      const device = await db.collection("devices")
          .doc(idDevice).get();
      const newUsersWaiting = device.data().usersWaiting;
      const index = newUsersWaiting
          .findIndex( (user) => user.id === idUser);
      const userWaitingToDelete = newUsersWaiting[index];
      // update device
      await db.collection("devices").doc(idDevice)
          .update( {
            usersWaiting: admin.firestore.FieldValue.arrayRemove(
                {
                  "id": userWaitingToDelete.id,
                  "lastName": userWaitingToDelete.lastName,
                  "name": userWaitingToDelete.name}),
            usersAllowed: admin.firestore.FieldValue.arrayUnion(
                idUser ),
            users: admin.firestore.FieldValue.arrayUnion(
                {"id": idUser,
                  "name": nameForDevice,
                })});
      return {
        result: "OK"};
    } else {
      throw new functions.https.HttpsError("failed-precondition",
          "The function must be called " +
          "if you are device admin");
    }
  } else {
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "if you are admin");
  }
});

exports.acceptInvitation =
functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "while authenticated.");
  }

  const idUser = context.auth.uid;
  const idDevice = data.idDevice;
  const device = await db.collection("devices")
      .doc(idDevice).get();
  if (!device.exists) {
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
    "whith good device id.");
  }
  // check if user exists in usersInvited in device
  const indexInvitedUser = device.data().usersInvited
      .findIndex((userInvited) => userInvited.id === idUser);
  if (indexInvitedUser === -1) {
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
    "with good invited person.");
  } else {
    const user = await db.collection("users")
        .doc(idUser).get();
    const userInvitedToDelete = device.data().usersInvited[indexInvitedUser];
    // update value of device
    await db.collection("devices").doc(idDevice)
        .update({
          usersWaiting: admin.firestore.FieldValue.arrayUnion(
              {"id": idUser,
                "name": user.data().name,
                "lastName": user.data().lastName}),
          usersInvited: admin.firestore.FieldValue.arrayRemove(
              {
                "email": userInvitedToDelete.email,
                "id": userInvitedToDelete.id,
              })});
    // change type of user

    const newDevices = user.data().devices;
    const indexDevice = user.data().devices
        .findIndex((device) => device.id === idDevice);
    newDevices[indexDevice].role = 2;
    // update user type for this device
    await db.collection("users")
        .doc(idUser).update({devices: newDevices});
    return {result: "OK"};
  }
});


exports.refuseInvitation =
functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "while authenticated.");
  }
  const idUser = context.auth.uid;
  const idDevice = data.idDevice;
  const device = await db.collection("devices")
      .doc(idDevice).get();
  if (!device.exists) {
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
    "whith good device id.");
  }
  // check if user exists in usersInvited in device
  const indexInvitedUser = device.data().usersInvited
      .findIndex((userInvited) => userInvited.id === idUser);
  if (indexInvitedUser === -1) {
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
    "with good invited person.");
  } else {
    const user = await db.collection("users")
        .doc(idUser).get();
    const userInvitedToDelete = device.data().usersInvited[indexInvitedUser];
    // update value of device
    await db.collection("devices").doc(idDevice)
        .update({
          usersInvited: admin.firestore.FieldValue.arrayRemove(
              {
                "email": userInvitedToDelete.email,
                "id": userInvitedToDelete.id,
              })});
    // change type of user

    const newDevices = user.data().devices;
    const indexDevice = user.data().devices
        .findIndex((device) => device.id === idDevice);
    newDevices.splice(indexDevice, 1);
    // update user type for this device
    await db.collection("users")
        .doc(idUser).update({devices: newDevices});
    return {result: "OK"};
  }
});


exports.changeAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called" +
              "while authenticated.");
  }
  const idUserFutureAdmin = data.idUser;
  const idDevice = data.idDevice;
  const adminUser = await db.collection("users")
      .doc(context.auth.uid).get();
  const indexDevice = adminUser.data().devices
      .findIndex((device)=> device.id === idDevice);
  if (indexDevice != -1 && adminUser.data().devices[indexDevice].role == 0) {
    const futureAdmin = await db.collection("users")
        .doc(idUserFutureAdmin).get();
    const indexDeviceFutureAdmin = futureAdmin.data()
        .devices.findIndex((device) => device.id === idDevice);
    const deviceToChange = futureAdmin.data().devices;
    deviceToChange[indexDeviceFutureAdmin].role = 0;
    const deviceAdmin = adminUser.data().devices;
    deviceAdmin[indexDevice].role = 1;
    await db.collection("users").doc(idUserFutureAdmin)
        .update({devices: deviceToChange});
    // add device admin to user
    await db.collection("devices").doc(idDevice)
        .update({admin: idUserFutureAdmin});
    await db.collection("users").doc(context.auth.uid)
        .update({devices: deviceAdmin});
    return {result: "OK"};
  } else return {result: "ERROR_ADMIN"};
});


exports.addEmergencyUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "while authenticated.");
  }
  const idUserForEmergency = data.idUserForEmergency;
  // request for adding person must be the root id
  const idAdmin = context.auth.uid;
  const idDevice = data.idDevice;
  // check if actual user is admin device
  const adminUser = await db.collection("users")
      .doc(idAdmin).get();
  if (adminUser.exists && deviceExist(adminUser.data().devices, idDevice)) {
    // so get device datas
    const device = await db.collection("devices").doc(idDevice)
        .get();
    const userTurtle = device.data().usersAllowed.find((userAllowed) =>
      userAllowed.id == idUserForEmergency);
    await db.collection("devices").doc(idDevice)
        .update({
          pFe: admin.firestore.FieldValue
              .arrayUnion({"id": userTurtle.id,
                "name": userTurtle.name})});

    return {result: "OK"};
  } else {
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "if you are admin");
  }
});

exports.removeEmergencyUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "while authenticated.");
  }
  const idUserForEmergency = data.idUserForEmergency;
  // request for adding person must be the root id
  const idAdmin = context.auth.uid;
  const idDevice = data.idDevice;
  // check if actual user is admin device
  const adminUser = await db.collection("users")
      .doc(idAdmin).get();
  if (adminUser.exists && deviceExist(adminUser.data().devices, idDevice)) {
    // so get device datas
    const device = await db.collection("devices").doc(idDevice)
        .get();
    const userTurtle = device.data().usersAllowed.find((userAllowed) =>
      userAllowed.id == idUserForEmergency);
    await db.collection("devices").doc(idDevice)
        .update({
          pFe: admin.firestore.FieldValue
              .arrayRemove({"id": userTurtle.id,
                "name": userTurtle.name})});

    return {result: "OK"};
  } else {
    throw new functions.https.HttpsError("failed-precondition",
        "The function must be called " +
        "if you are admin");
  }
});

