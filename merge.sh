#!/bin/bash -xe
# @see https://stackoverflow.com/a/66632451/3577474
#
# To merge repositories into the current.
# To see the log of the new repo use 'git log --follow -- unprefixed-filename'
# So if the file is repo/test.cpp use 'git log --follow -- test.cpp'
#
# `git branch -a` will show newly created branches.

rm -rf clones
mkdir -p clones

repo="$1" # url of the remote repo
rn="$2"   # new name of the repo, you can keep the same name as well.

git clone ${repo} clones/wip
cd clones/wip
git checkout -b migrate
git filter-repo --to-subdirectory-filter ${rn} --force

cd ../..
git remote add ${rn} clones/wip
git fetch ${rn}
git rebase --rebase-merges --onto dev --root ${rn}/migrate --committer-date-is-author-date

git checkout -b ${rn}
git checkout dev
git merge ${rn}

git branch -d ${rn}
git remote remove ${rn}
rm -rf clones/wip
