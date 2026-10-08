import type { CheckerPlugin } from "@rmtest/core";
import { assetDimensionChecker } from "./checkers/asset-dimension.ts";
import { danglingRefChecker } from "./checkers/dangling.ts";
import { faceIndexChecker } from "./checkers/face-index.ts";
import { iconIndexChecker } from "./checkers/icon-index.ts";
import { readNeverWrittenChecker, writtenNeverReadChecker } from "./checkers/lifecycle.ts";
import { pictureNoEraseChecker, pictureOffscreenChecker } from "./checkers/picture.ts";
import { unreachableMapChecker } from "./checkers/reachability.ts";
import { transferSoftlockChecker } from "./checkers/transfer.ts";
import { textOverflowChecker } from "./checkers/text-overflow.ts";

export const checkers: CheckerPlugin[] = [
  danglingRefChecker,
  assetDimensionChecker,
  faceIndexChecker,
  iconIndexChecker,
  pictureOffscreenChecker,
  pictureNoEraseChecker,
  textOverflowChecker,
  readNeverWrittenChecker,
  writtenNeverReadChecker,
  transferSoftlockChecker,
  unreachableMapChecker,
];

export { danglingRefChecker, assetDimensionChecker, faceIndexChecker, iconIndexChecker, pictureOffscreenChecker, pictureNoEraseChecker, textOverflowChecker };
