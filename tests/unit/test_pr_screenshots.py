"""scripts/pr-screenshots.sh against a throwaway bare repository (#477).

The script publishes a PR's screenshots to the orphan `pr-screenshots`
branch and prints Markdown pinned to the commit it pushed. These tests run
the real script with a local bare repository as the remote, so nothing
reaches GitHub.
"""

import re
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "pr-screenshots.sh"
REPO = "owner/name"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


@pytest.fixture
def checkout(tmp_path: Path) -> Path:
    remote = tmp_path / "remote.git"
    work = tmp_path / "work"
    subprocess.run(["git", "init", "--quiet", "--bare", str(remote)], check=True)
    subprocess.run(["git", "init", "--quiet", "-b", "master", str(work)], check=True)
    git(work, "config", "user.name", "Test")
    git(work, "config", "user.email", "test@example.com")
    (work / "README.md").write_text("project\n")
    git(work, "add", "README.md")
    git(work, "commit", "--quiet", "-m", "initial")
    git(work, "remote", "add", "origin", str(remote))
    git(work, "push", "--quiet", "origin", "master")
    return work


def image(base: Path, relative: str) -> Path:
    path = base / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(PNG)
    return path


def run(checkout: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(SCRIPT), *args],
        cwd=checkout,
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "PR_SCREENSHOTS_REPO": REPO},
    )


def remote_files(checkout: Path, ref: str) -> list[str]:
    git(checkout, "fetch", "--quiet", "origin", ref)
    return git(checkout, "ls-tree", "-r", "--name-only", "FETCH_HEAD").splitlines()


def test_publishes_to_an_orphan_branch_and_prints_pinned_links(checkout, tmp_path):
    shots = tmp_path / "shots"
    light = image(shots, "home/light-1-accueil.png")
    dark = image(shots, "home/dark-1-accueil.png")

    result = run(checkout, "478", str(light), str(dark))

    assert result.returncode == 0, result.stderr
    commit = git(checkout, "ls-remote", "origin", "refs/heads/pr-screenshots").split()[0]
    assert result.stdout.splitlines() == [
        f"![home-light-1-accueil](https://raw.githubusercontent.com/{REPO}/{commit}/478/home-light-1-accueil.png)",
        f"![home-dark-1-accueil](https://raw.githubusercontent.com/{REPO}/{commit}/478/home-dark-1-accueil.png)",
    ]
    assert remote_files(checkout, "pr-screenshots") == [
        "478/home-dark-1-accueil.png",
        "478/home-light-1-accueil.png",
    ]
    # Orphan: no history shared with the project, nothing but images.
    assert git(checkout, "rev-list", "--count", "FETCH_HEAD") == "1"
    no_common_ancestor = subprocess.run(
        ["git", "merge-base", "FETCH_HEAD", "master"], cwd=checkout, capture_output=True
    )
    assert no_common_ancestor.returncode == 1


def test_a_later_run_adds_to_the_branch_and_keeps_earlier_links_valid(checkout, tmp_path):
    first = run(checkout, "1", str(image(tmp_path, "a/light-1.png")))
    second = run(checkout, "2", str(image(tmp_path, "b/light-1.png")))

    assert first.returncode == 0 and second.returncode == 0
    first_commit = re.search(r"/name/([0-9a-f]{40})/", first.stdout).group(1)
    assert remote_files(checkout, "pr-screenshots") == ["1/a-light-1.png", "2/b-light-1.png"]
    # The first PR's links pin a commit that still holds its image.
    assert git(checkout, "cat-file", "-t", f"{first_commit}:1/a-light-1.png") == "blob"
    assert git(checkout, "rev-list", "--count", "FETCH_HEAD") == "2"


def test_the_project_branch_and_working_tree_are_untouched(checkout, tmp_path):
    head = git(checkout, "rev-parse", "HEAD")

    run(checkout, "3", str(image(tmp_path, "tabs/light-1.png")))

    assert git(checkout, "rev-parse", "HEAD") == head
    assert git(checkout, "status", "--porcelain") == ""


@pytest.mark.parametrize(
    "args",
    [
        ["478"],
        ["pr-478", "x.png"],
    ],
)
def test_bad_arguments_are_refused(checkout, args):
    assert run(checkout, *args).returncode == 2


def test_a_missing_or_non_image_file_is_refused(checkout, tmp_path):
    notes = tmp_path / "notes.txt"
    notes.write_text("not an image")
    assert run(checkout, "1", str(tmp_path / "missing.png")).returncode == 1
    assert run(checkout, "1", str(notes)).returncode == 1


def test_two_images_that_would_share_a_name_are_refused(checkout, tmp_path):
    one = image(tmp_path / "x", "home/light-1.png")
    two = image(tmp_path / "y", "home/light-1.png")
    result = run(checkout, "1", str(one), str(two))
    assert result.returncode == 1
    assert "share a name" in result.stderr
