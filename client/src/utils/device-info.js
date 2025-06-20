const names = [];
let orderNum = 1;

// 获取设备信息
export const getDeviceInfo = () => {
  const os = getOS();
  let deviceName = getDeviceName(os);

  if (names.includes(deviceName)) {
    deviceName = deviceName + "-" + orderNum.toString();
    orderNum++;
  }

  names.push(deviceName);

  return {
    userAgent: navigator.userAgent || "Unknown Device",
    deviceName: deviceName,
    os: os,
  };
};

const getOS = function () {
  const u = navigator.userAgent;
  if (!!u.match(/compatible/i) || u.match(/Windows/i)) {
    return "windows";
  } else if (!!u.match(/Macintosh/i) || u.match(/MacIntel/i)) {
    console.log();
    if (window.screen.width >= 1680) {
      return "macOS";
    }
    return "ipadOS";
  } else if (!!u.match(/iphone/i)) {
    return "ios";
  } else if (u.match(/android/i)) {
    return "android";
  } else if (u.match(/Ubuntu/i)) {
    return "Ubuntu";
  } else if (u.match(/Ipad/i)) {
    return "ipadOS";
  } else {
    return "other";
  }
};

const getDeviceName = (os) => {
  const u = navigator.userAgent;
  if (os === "windows") {
    return "Windows电脑";
  }

  if (os === "Ubuntu") {
    return "Linux电脑";
  }

  if (os === "macOS") {
    return "Mac";
  }
  if (os === "ios") {
    return "iPhone";
  }

  if (os === "ipadOS") {
    return "ipad";
  }

  if (os === "android") {
    return "Android手机";
  }

  if (os === "other") {
    return "unknow";
  }
};
