#!/usr/bin/env perl
# scripts/test-db-lock.pl — the one lock around the shared local test database.
# scripts/test-db.sh holds it exclusive while it resets; every vitest run holds
# it shared (tests/test-db-lock.setup.ts). So a reset waits for running tests,
# and a test run waits for a reset. flock is released by the kernel when the
# holder exits, so a crash never leaves it held; perl and flock exist on macOS
# and on the Linux CI runners alike.
#
# A second "gate" lock keeps resets from starving: a reset holds the gate
# while it waits, and a test run must pass the gate before it takes its share,
# so once a reset is waiting, new test runs queue behind it.
#
#   perl scripts/test-db-lock.pl ex CMD...   run CMD holding the lock exclusive
#   perl scripts/test-db-lock.pl sh          hold it shared; print "locked",
#                                            release when stdin closes
use strict;
use warnings;
use Fcntl qw(:flock);
BEGIN { $^F = 255 }    # keep the locks' descriptors open across exec

my $mode = shift // die "usage: test-db-lock.pl ex CMD... | sh\n";
my $path = $ENV{MGR_TEST_DB_LOCK} // '/tmp/mgr-test-db.lock';
open(my $gate, '>>', "$path.gate") or die "test-db lock: $path.gate: $!\n";
open(my $lock, '>>', $path) or die "test-db lock: $path: $!\n";

sub take {
  my ($fh, $op, $what) = @_;
  return if flock($fh, $op | LOCK_NB);
  print STDERR "test-db lock: waiting for $what to finish\n";
  flock($fh, $op) or die "test-db lock: $!\n";
}
local $SIG{ALRM} = sub { die "test-db lock: still held after 10 minutes (a vitest in watch mode?)\n" };
alarm 600;
if ($mode eq 'ex') {
  take($gate, LOCK_EX, 'another reset');
  take($lock, LOCK_EX, 'running tests');
} else {
  take($gate, LOCK_SH, 'a reset');
  take($lock, LOCK_SH, 'a reset');
  flock($gate, LOCK_UN);
}
alarm 0;

if (@ARGV) { exec @ARGV or die "test-db lock: $ARGV[0]: $!\n" }
$| = 1;
print "locked\n";
1 while <STDIN>;
