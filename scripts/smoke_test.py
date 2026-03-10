#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import expect, sync_playwright
except ImportError:
    print('缺少 Python Playwright 依赖，请先执行：')
    print('  python3 -m pip install playwright')
    print('  python3 -m playwright install chromium')
    sys.exit(2)


ROOT_DIR = Path(__file__).resolve().parents[1]
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class SmokeTestError(RuntimeError):
    pass


class ManagedService:
    def __init__(self, name, health_url, command, cwd, log_path):
        self.name = name
        self.health_url = health_url
        self.command = command
        self.cwd = cwd
        self.log_path = log_path
        self.process = None
        self.reused = False

    def start(self, timeout=30):
        if is_http_ready(self.health_url, timeout=1):
            self.reused = True
            return

        log_file = open(self.log_path, 'w', encoding='utf-8')
        self.process = subprocess.Popen(
            self.command,
            cwd=self.cwd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
            preexec_fn=os.setsid if os.name != 'nt' else None
        )

        if not wait_for_http(self.health_url, timeout=timeout):
            self.stop()
            raise SmokeTestError(f'{self.name} 启动失败，未在 {timeout}s 内就绪：{self.log_path}')

    def stop(self):
        if not self.process:
            return

        if self.process.poll() is not None:
            return

        if os.name == 'nt':
            self.process.terminate()
        else:
            os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)

        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            if os.name == 'nt':
                self.process.kill()
            else:
                os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
            self.process.wait(timeout=5)


def parse_args():
    parser = argparse.ArgumentParser(description='运行页面级 smoke test')
    parser.add_argument('--api-base', default='http://127.0.0.1:3000')
    parser.add_argument('--frontend-url', default='http://127.0.0.1:8000/schedule.html')
    parser.add_argument('--skip-rag', action='store_true')
    parser.add_argument('--keep-artifacts', action='store_true')
    parser.add_argument('--artifacts-dir', default='')
    return parser.parse_args()


def make_artifacts_dir(path_value):
    if path_value:
        path = Path(path_value).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path
    return Path(tempfile.mkdtemp(prefix='schedule-smoke-'))


def is_http_ready(url, timeout=3):
    try:
        request = urllib.request.Request(url, method='GET')
        with OPENER.open(request, timeout=timeout) as response:
            return 200 <= response.status < 400
    except Exception:
        return False


def wait_for_http(url, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if is_http_ready(url, timeout=3):
            return True
        time.sleep(0.5)
    return False


def wait_for_condition(checker, timeout=30, interval=1):
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = checker()
        if value:
            return value
        time.sleep(interval)
    return None


def api_request(api_base, path, method='GET', payload=None, allow_404=False):
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    request = urllib.request.Request(f'{api_base}{path}', data=body, method=method, headers=headers)
    try:
        with OPENER.open(request, timeout=120) as response:
            raw = response.read().decode('utf-8')
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        if allow_404 and error.code == 404:
            return None
        detail = error.read().decode('utf-8', errors='ignore')
        raise SmokeTestError(f'API {method} {path} 失败：HTTP {error.code} {detail}') from error
    except urllib.error.URLError as error:
        raise SmokeTestError(f'API {method} {path} 失败：{error.reason}') from error


def create_test_files(artifacts_dir, prefix, rag_token):
    files = []
    trace_code = f'TRACE_PATH_{prefix.replace("-", "_")}'
    rag_file = artifacts_dir / f'{prefix}-rag.md'
    rag_file.write_text(
        '\n'.join([
            '# Smoke Test RAG',
            '',
            '用途：这是一份用于验证上传、预览、分页和 RAG 的测试文档。',
            '关键问题：smoke test 暗号是什么？',
            f'唯一暗号：{rag_token}',
            '',
            '功能列表：',
            '- 日志检索：用于按关键词查找历史记录，内部代号 LOG_VIEW。',
            f'- 调用链追踪：最适合排查调用链问题，内部代号 {trace_code}。',
            '- 评估面板：用于对比多个实验结果，内部代号 EVAL_BOARD。',
            ''
        ]),
        encoding='utf-8'
    )
    files.append(rag_file)

    for index in range(1, 5):
        file_path = artifacts_dir / f'{prefix}-{index}.md'
        file_path.write_text(
            (
                f'# Smoke Test {index}\n\n'
                f'文件序号：{index}\n\n'
                '这是一份分页测试文档。\n\n'
                f'备用代号：FILLER_{index}_{prefix.replace("-", "_")}\n'
            ),
            encoding='utf-8'
        )
        files.append(file_path)

    return files, trace_code


def cleanup_uploaded_files(api_base, prefix, warnings):
    files_data = api_request(api_base, '/files/all')
    targets = [item for item in files_data.get('files', []) if (item.get('name') or '').startswith(prefix)]

    while targets:
        current = targets[0]
        try:
            api_request(api_base, f"/schedule/{current['scheduleId']}/files/{current['fileIndex']}", method='DELETE')
        except Exception as error:
            warnings.append(f"清理上传文件失败：{current.get('name')} - {error}")
            break

        files_data = api_request(api_base, '/files/all')
        targets = [item for item in files_data.get('files', []) if (item.get('name') or '').startswith(prefix)]


def print_pass(message):
    print(f'[PASS] {message}')


def print_warn(message):
    print(f'[WARN] {message}')


def print_fail(message):
    print(f'[FAIL] {message}')


def safe_capture_screenshot(page, screenshot_path):
    if not page:
        return
    try:
        page.screenshot(path=str(screenshot_path), full_page=True)
    except Exception:
        pass


def run_browser_checks(frontend_url, api_base, skip_rag, artifacts_dir):
    timestamp = int(time.time())
    prefix = f'smoke-test-{timestamp}'
    rag_token = f'RAG_TOKEN_{timestamp}'
    screenshot_path = artifacts_dir / 'failure.png'
    files, trace_code = create_test_files(artifacts_dir, prefix, rag_token)
    results = []
    warnings = []
    console_errors = []
    original_message_board = api_request(api_base, '/messageBoard', allow_404=True)
    page = None
    browser = None
    playwright = None

    try:
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 2200})
        page.on('pageerror', lambda error: console_errors.append(f'pageerror: {error}'))
        page.on('console', lambda msg: console_errors.append(f'console {msg.type}: {msg.text}') if msg.type == 'error' else None)
        page.on('dialog', lambda dialog: dialog.accept())

        page.goto(frontend_url, wait_until='domcontentloaded', timeout=60000)
        page.locator('#scheduleBody tr').first.wait_for(timeout=30000)
        page.locator('#totalFilesCount').wait_for(timeout=30000)
        initial_file_count = int(page.locator('#totalFilesCount').inner_text())
        results.append(f'页面加载完成，初始文档数 {initial_file_count}')
        print_pass(results[-1])

        page.locator('input.file-input').first.set_input_files([str(file_path) for file_path in files])
        expect(page.locator('#totalFilesCount')).to_have_text(str(initial_file_count + len(files)), timeout=120000)
        results.append(f'上传成功，新增 {len(files)} 个 Markdown 文件')
        print_pass(results[-1])

        search_input = page.locator('#fileSearchInput')
        search_input.fill(f'{prefix}-rag')
        expect(page.locator('#totalFilesCount')).to_have_text('1', timeout=30000)
        page.locator('.document-item .download-btn').first.click()
        expect(page.locator('#filePreviewSection')).to_be_visible(timeout=30000)
        expect(page.locator('#previewFileNameInline')).to_contain_text(f'{prefix}-rag.md', timeout=30000)
        expect(page.locator('#filePreviewContentInline')).to_contain_text(rag_token, timeout=30000)
        page.locator('#previewCloseBtn').click()
        expect(page.locator('#filePreviewSection')).not_to_be_visible(timeout=30000)
        results.append('文档预览正常，Markdown 内容可见')
        print_pass(results[-1])

        search_input.fill('')
        expect(page.locator('#totalFilesCount')).to_have_text(str(initial_file_count + len(files)), timeout=30000)
        pagination = page.locator('.pagination-info')
        expect(pagination).to_contain_text('第 1 / 2 页', timeout=30000)
        page.get_by_role('button', name='下一页').click()
        expect(pagination).to_contain_text('第 2 / 2 页', timeout=30000)
        page.get_by_role('button', name='上一页').click()
        expect(pagination).to_contain_text('第 1 / 2 页', timeout=30000)
        results.append('分页切换正常')
        print_pass(results[-1])

        feedback_total = int(page.locator('#feedbackTotal').inner_text())
        page.locator('#addFeedbackBtn').click()
        expect(page.locator('#feedbackTotal')).to_have_text(str(feedback_total + 1), timeout=30000)
        page.locator('#feedbackBody tr .editable-cell[data-field="description"]').first.click()
        desc_input = page.locator('#feedbackBody tr input[type="text"]').first
        desc_input.fill(f'{prefix} feedback')
        desc_input.press('Enter')
        feedback_row = page.locator(f'#feedbackBody tr:has-text("{prefix} feedback")').first
        expect(feedback_row).to_contain_text(f'{prefix} feedback', timeout=30000)
        feedback_row.locator('.editable-cell[data-field="category"]').click()
        page.locator('#feedbackBody tr select').first.select_option('Bug反馈')
        feedback_row = page.locator(f'#feedbackBody tr:has-text("{prefix} feedback")').first
        expect(feedback_row.locator('.category-tag')).to_contain_text('Bug反馈', timeout=30000)
        feedback_row.locator('.status-badge').click()
        feedback_row = page.locator(f'#feedbackBody tr:has-text("{prefix} feedback")').first
        expect(feedback_row.locator('.status-badge')).to_contain_text('已完成', timeout=30000)
        feedback_row.locator('.delete-feedback-btn').click()
        expect(page.locator('#feedbackTotal')).to_have_text(str(feedback_total), timeout=30000)
        results.append('留言板新增、编辑、状态切换和删除正常')
        print_pass(results[-1])

        rag_status = api_request(api_base, '/api/rag/status')
        if skip_rag:
            warnings.append('已按参数跳过 RAG 测试')
            print_warn(warnings[-1])
        else:
            if not rag_status.get('configured'):
                raise SmokeTestError('RAG 未配置，无法执行问答测试；可使用 --skip-rag 跳过')

            page.locator('#ragReindexBtn').click()
            page.locator('#ragReindexBtn').wait_for(state='visible', timeout=30000)
            target_file_count = initial_file_count + len(files)
            status_after_reindex = wait_for_condition(
                lambda: (
                    lambda status: status
                    if status.get('totalFiles', 0) >= target_file_count and status.get('totalChunks', 0) > 0
                    else None
                )(api_request(api_base, '/api/rag/status')),
                timeout=240,
                interval=2
            )
            if not status_after_reindex:
                raise SmokeTestError(f'等待 RAG 重建索引超时，目标文件数至少为 {target_file_count}')

            expect(page.locator('#ragStatusBadge')).to_have_text('就绪', timeout=30000)
            results.append('RAG 重建索引完成')
            print_pass(results[-1])

            no_evidence = api_request(api_base, '/api/rag/query', method='POST', payload={
                'query': '这份文档里提到的火星基地预算是多少？请只回答数字。'
            })
            if '没有足够证据' not in (no_evidence.get('answer') or ''):
                raise SmokeTestError(f'RAG 未按预期拒答无关问题：{no_evidence}')
            results.append('RAG 无关问题拒答正常')
            print_pass(results[-1])

            follow_up_first_question = '哪一个功能最适合排查调用链？请只返回功能名。'
            follow_up_first = api_request(api_base, '/api/rag/query', method='POST', payload={
                'query': follow_up_first_question
            })
            if '调用链追踪' not in (follow_up_first.get('answer') or ''):
                raise SmokeTestError(f'RAG 未返回预期的追问前置答案：{follow_up_first}')

            follow_up_second = api_request(api_base, '/api/rag/query', method='POST', payload={
                'query': '它的内部代号是什么？请只返回代号本身。',
                'history': [
                    {'role': 'user', 'content': follow_up_first_question},
                    {'role': 'assistant', 'content': follow_up_first.get('answer', '')}
                ]
            })
            if trace_code not in (follow_up_second.get('answer') or ''):
                raise SmokeTestError(f'RAG 多轮追问未返回预期代号：{follow_up_second}')
            results.append('RAG 多轮追问检索正常')
            print_pass(results[-1])

            rag_input = page.locator('#ragInput')
            rag_input.fill('smoke test 暗号是什么？请只返回暗号本身')
            page.locator('#ragSendBtn').click()
            assistant_message = page.locator('.rag-message.assistant').last
            expect(assistant_message).to_contain_text(rag_token, timeout=180000)
            source_tag = assistant_message.locator(f'.rag-source-tag:has-text("{prefix}-rag.md")').first
            expect(source_tag).to_contain_text(f'{prefix}-rag.md', timeout=30000)
            expect(assistant_message.locator('.rag-source-snippet').first).to_contain_text('唯一暗号', timeout=30000)
            source_tag.click()
            expect(page.locator('#filePreviewSection')).to_be_visible(timeout=30000)
            expect(page.locator('#previewFileNameInline')).to_contain_text(f'{prefix}-rag.md', timeout=30000)
            results.append('RAG 查询和来源回跳预览正常')
            print_pass(results[-1])
    except PlaywrightTimeoutError as error:
        safe_capture_screenshot(page, screenshot_path)
        raise SmokeTestError(f'页面测试超时：{error}\n截图：{screenshot_path}') from error
    except Exception as error:
        safe_capture_screenshot(page, screenshot_path)
        raise SmokeTestError(f'页面测试失败：{error}\n截图：{screenshot_path}') from error
    finally:
        if browser:
            browser.close()
        if playwright:
            playwright.stop()
        cleanup_uploaded_files(api_base, prefix, warnings)
        if original_message_board is not None:
            try:
                api_request(api_base, '/messageBoard', method='PUT', payload=original_message_board)
            except Exception as error:
                warnings.append(f'恢复留言板数据失败：{error}')

    return results, warnings, console_errors


def main():
    args = parse_args()
    artifacts_dir = make_artifacts_dir(args.artifacts_dir)
    backend_log = artifacts_dir / 'backend.log'
    frontend_log = artifacts_dir / 'frontend.log'

    backend = ManagedService(
        name='后端',
        health_url=f'{args.api_base}/schedule',
        command=[str(ROOT_DIR / 'start-backend.sh')],
        cwd=ROOT_DIR,
        log_path=backend_log
    )
    frontend = ManagedService(
        name='前端',
        health_url=args.frontend_url,
        command=['python3', '-m', 'http.server', '8000', '--bind', '127.0.0.1'],
        cwd=ROOT_DIR,
        log_path=frontend_log
    )

    try:
        backend.start(timeout=45)
        print_pass(f'后端就绪：{args.api_base}')
        if backend.reused:
            print_warn('复用已有后端服务')

        frontend.start(timeout=20)
        print_pass(f'前端就绪：{args.frontend_url}')
        if frontend.reused:
            print_warn('复用已有前端服务')

        results, warnings, console_errors = run_browser_checks(
            frontend_url=args.frontend_url,
            api_base=args.api_base,
            skip_rag=args.skip_rag,
            artifacts_dir=artifacts_dir
        )

        rag_status = api_request(args.api_base, '/api/rag/status')
        total_chunks = rag_status.get('totalChunks', 0)
        total_files = rag_status.get('totalFiles', 0)
        print_pass(f'测试完成，当前索引状态：{total_files} 个文件 / {total_chunks} 个片段')

        for warning in warnings:
            print_warn(warning)
        for console_error in console_errors:
            print_warn(console_error)

        print(f'Artifacts: {artifacts_dir}')
        return 0
    except SmokeTestError as error:
        print_fail(str(error))
        print(f'Artifacts: {artifacts_dir}')
        print(f'Backend log: {backend_log}')
        print(f'Frontend log: {frontend_log}')
        return 1
    finally:
        backend.stop()
        frontend.stop()
        if not args.keep_artifacts and backend_log.exists() and frontend_log.exists():
            if backend_log.stat().st_size == 0:
                backend_log.unlink()
            if frontend_log.stat().st_size == 0:
                frontend_log.unlink()
            if artifacts_dir.exists() and not any(artifacts_dir.iterdir()):
                shutil.rmtree(artifacts_dir, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
