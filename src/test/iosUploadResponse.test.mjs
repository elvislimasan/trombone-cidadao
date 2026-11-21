import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('delegate Swift distingue HTTP 2xx, rejeição, erro de rede e cancelamento', { skip: process.platform !== 'darwin' }, async () => {
  const source = await fs.readFile(new URL('../../ios/App/App/VideoProcessor.swift', import.meta.url), 'utf8');
  // Executa o delegate real com tasks controladas, sem Capacitor, UIKit ou rede.
  const state = source.slice(source.indexOf('    private struct UploadState'), source.indexOf('    // Calls pendentes'));
  const delegate = source.slice(source.indexOf('extension VideoProcessorPlugin: URLSessionDataDelegate'));
  const harness = `
import Foundation
class TestUploadTask: URLSessionUploadTask, @unchecked Sendable {
    let testCode: Int
    init(_ code: Int) { testCode = code; super.init() }
    override var taskIdentifier: Int { testCode }
    override var response: URLResponse? {
        HTTPURLResponse(url: URL(string: "https://storage.invalid/photo.jpg")!, statusCode: testCode, httpVersion: nil, headerFields: nil)
    }
}
class VideoProcessorPlugin: NSObject, @unchecked Sendable {
${state}
    var events: [[String: Any]] = []
    func notifyListeners(_ name: String, data: [String: Any]) { events.append(data) }
    func verify(_ code: Int, _ expected: String, error: Error? = nil) {
        let id = UUID().uuidString
        let task = TestUploadTask(code)
        uploads[id] = UploadState()
        taskToUpload[task.taskIdentifier] = id
        urlSession(URLSession.shared, task: task, didCompleteWithError: error)
        precondition(events.last?["status"] as? String == expected, "HTTP \\(code): \\(events)")
        precondition(events.last?["progress"] as? Int == (expected == "completed" ? 100 : 0))
        precondition(uploads[id] == nil && taskToUpload[task.taskIdentifier] == nil)
    }
}
${delegate}
let plugin = VideoProcessorPlugin()
for code in [200, 201, 204, 299] { plugin.verify(code, "completed") }
for code in [400, 401, 403, 413, 500] { plugin.verify(code, "error_upload_failed_\\(code)") }
plugin.verify(200, "error", error: NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet))
plugin.verify(200, "cancelled", error: NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled))
print("11 cenários Swift passaram")
`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ios-upload-response-'));
  try {
    const script = path.join(dir, 'main.swift');
    await fs.writeFile(script, harness);
    const { stdout } = await exec('xcrun', ['swift', '-module-cache-path', path.join(dir, 'module-cache'), script], { timeout: 60000, maxBuffer: 1024 * 1024 });
    assert.match(stdout, /11 cenários Swift passaram/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
