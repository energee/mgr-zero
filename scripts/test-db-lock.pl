#!/usr/bin/env perl
# scripts/test-db-lock.pl — the one lock around the shared local test database.
# scripts/test-db.sh holds it exclusive while it resets; the database Vitest
# project holds it shared (tests/test-db-lock.setup.ts). A reset waits for tests,
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

my $mode = shift // die "usage: test-db-lock.pl ex CMD... | sh | check\n";
die "test-db lock: invalid mode $mode\n" unless $mode =~ /^(ex|sh|check)$/;
my $path = $ENV{MGR_TEST_DB_LOCK} // '/tmp/mgr-test-db.lock';
my $inherited;
if (defined $ENV{MGR_TEST_DB_LOCK_FD}) {
  my $fd = $ENV{MGR_TEST_DB_LOCK_FD};
  die "test-db lock: invalid inherited descriptor\n" unless $fd =~ /^\d+$/ && $fd >= 3 && $fd <= 255;
  open($inherited, '+<&=', $fd) or die "test-db lock: inherited descriptor $fd is closed\n";
  my @held = stat($inherited);
  my @target = stat($path);
  die "test-db lock: inherited descriptor does not protect $path (do not override MGR_TEST_DB_LOCK)\n"
    unless @held && @target && $held[0] == $target[0] && $held[1] == $target[1];
  flock($inherited, LOCK_EX | LOCK_NB) or die "test-db lock: inherited exclusive lock was lost\n";
}
if ($mode eq 'check') {
  die "test-db lock: --locked-reset requires an inherited exclusive lock; run scripts/test-db.sh\n" unless $inherited;
  exit 0;
}
my ($gate, $lock);
unless ($inherited) {
  open($gate, '>>', "$path.gate") or die "test-db lock: $path.gate: $!\n";
  open($lock, '>>', $path) or die "test-db lock: $path: $!\n";
}

sub take {
  my ($fh, $op, $what) = @_;
  return if flock($fh, $op | LOCK_NB);
  print STDERR "test-db lock: waiting for $what to finish\n";
  flock($fh, $op) or die "test-db lock: $!\n";
}
local $SIG{ALRM} = sub { die "test-db lock: still held after 10 minutes (a vitest in watch mode?)\n" };
alarm 600;
if (!$inherited && $mode eq 'ex') {
  take($gate, LOCK_EX, 'another reset');
  take($lock, LOCK_EX, 'running tests');
  $ENV{MGR_TEST_DB_LOCK_FD} = fileno($lock);
} elsif (!$inherited) {
  take($gate, LOCK_SH, 'a reset');
  take($lock, LOCK_SH, 'a reset');
  flock($gate, LOCK_UN);
}
alarm 0;

if (@ARGV) { exec @ARGV or die "test-db lock: $ARGV[0]: $!\n" }
$| = 1;
print "locked\n";
1 while <STDIN>;
