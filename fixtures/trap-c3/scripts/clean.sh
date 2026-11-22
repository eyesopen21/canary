#!/bin/sh
rm -rf ${TARGET}/*
rm -rf "${GUARDED:?must be set}"
