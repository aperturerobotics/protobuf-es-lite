import {CompleteMessage} from "../src"
import { EchoMsg } from "./example.pb.js"

function main() {
  const msg: EchoMsg = {body: "test"}
  const completeMessage: CompleteMessage<EchoMsg> = EchoMsg.create(msg)
  const sender = completeMessage.timestamps[0]
}
